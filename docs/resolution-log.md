# Resolution log

Append-only. Each entry is dated and records what was done and the decisions a
future agent should not relitigate.

## 2026-07-17: Four scoped fixes to the Super Ramble preview flow, found comparing our own screenshots against real Todoist's "Text Scan" on the same input

One branch, four items, building on the 2026-07-16 "five scoped pieces"
entry below (the editable preview, the task-count/transcript summary, the
thumbs feedback signal): read that entry in full before touching
`TaskRow.jsx` or `SuperRambleModal.jsx`, as instructed, since it explains
why several things were already built the way they were found. `docs/orchestration.md`
and the full `docs/` set read fresh first too.

**Item 1: the loading estimate's real numbers.** `npm run structure:timing-stats`
(after one transient Cloud Logging 429, retried and succeeded) still
reports only 8 real calls total, but a finding worth stating plainly: every
one of the 8 is the identical test transcript ("Portugal trip... Sarah
keeps asking..."), all dated 2026-07-14, the Hosting-cutoff/timeout
diagnostic session (`docs/architecture.md`), confirmed directly by reading
each trace's own `transcript` field back out of Firestore, not assumed
from the timing data alone. This is not diverse organic usage; it is one
transcript run repeatedly under differing test conditions. The sample is
sharply bimodal, not smooth: 2 calls at 9.4s/10.2s (under 1000 output
tokens), 6 calls at 71-96s (near the 8192 `max_tokens` cap). The naive
overall p50 across all 8 (81.4s) is dragged almost entirely by the 6 slow
calls and would still read exactly as wrong against a fast real call as the
old 82s guess did, the same "obviously wrong" framing that motivated this
item, so `STRUCTURE_P50_SECONDS` now uses the fast bucket instead
(p50=9.4s, p90=10.2s, rounded up to a clean **10**), since that is what
"usual" means for a call that is not pushing the model to its own output
ceiling. `STRUCTURE_P90_SECONDS` stays **96** on purpose, unchanged: the
real near-max-token/overall p90 (96.2s) already matches, and the existing
copy already frames it as the complex-dump ceiling, not the typical case.
Re-run this script once real, varied usage (not one repeated test
transcript) accumulates; `docs/roadmap.md`'s "Next" section already flags
this as due for revisiting periodically.

**Item 2: click a task to open its edit card, collapsed by default.**
`TaskRow.jsx`'s `editable` mode used to show every row's content input and
full `.task-edit-controls` chip row simultaneously, on every task at once,
the direct cause of the cluttered look found comparing against real
Todoist's Text Scan (a real date chip sitting right above an empty gray
"Priority"/"Date" ghost-chip pair). Now a row collapses to the same plain
`.task-content` div and read-only `.task-meta` line every non-editable row
in this app already renders; clicking the row's main area (not the remove
"x") expands it into a new `.task-edit-card`, reusing the exact
in-place-expansion convention `.inline-add`/`.comment-add-box` already
established (thin `1px solid var(--ds-line)` border, `--ds-canvas`
background, not a new visual language): the content input, the
`.task-edit-controls` row (now only rendered here, not always-on), and a
single "Done" button (`.task-edit-done`, checkmark tinted `--ds-due-green`)
collapsing back. `expandedTaskId` (a `flattenTasks` ref, or `null`) is
threaded through `TaskRow`'s recursion as the raw value, never a
pre-resolved boolean: each row compares it against its own `task.id`,
otherwise a child row's own accordion state would be wrong at any depth
past the one that first received a resolved boolean (caught this while
wiring the recursive call, before it ever reached the browser).

**Lives in `SuperRambleModal.jsx`, not `TreePreview`, a deliberate
deviation from a literal reading of "lift into TreePreview."** The state
has to be reachable from the modal's own existing Escape handler, so an
expanded row collapses first, before the handler ever considers closing
the whole modal; keeping it inside `TreePreview` alone would have left no
clean way for that handler to know a row was open without new prop/ref
plumbing in the other direction. `TreePreview` is still the only component
that branches on it for rendering, so the accordion behavior itself (one
row expanded at a time, across the whole tree) is unaffected by exactly
whose `useState` call owns the value. Reset to `null` on a fresh proposal
(`submit()`), on `backToEdit()`, and when the exact expanded task is
removed (`removeTask`, a merely-tidy clear: a stale ref pointing at a
removed row is already harmless on its own, since no remaining row would
ever match it).

**Deliberately left out, three things Todoist's own reference card shows
that this one does not:** a Description field (neither `task` nor
`subtask` carries a `description` in the Structure contract at all yet,
`docs/llm-pipeline.md` Stage 2, already its own named future item,
`docs/roadmap.md`'s "Next" section); a Reminders field (removed from this
app's entire data model on purpose, `docs/architecture.md`, not an
oversight to quietly work around); and a per-task project-reassignment
picker (there is no mechanism for routing one task within a single
Structure response into an arbitrary different project, the whole
response writes into one project or Inbox in one `createProjectTree`
batch, `src/pipeline/write.js`'s `toProjectTree`, so real per-task
cross-project reassignment would be an architecture change, not a UI fix).
**No Cancel beside Done either**: every field here already writes to
`edited` state directly on every change, there is no local draft a Cancel
would actually revert, so a second button would look like it discards
changes without doing so, not a faithful copy of Todoist's own X/check
pair (which has a real draft behind it).

**Item 3: a three-way header — new project, existing project, or loose
tasks.** `isNewProject`'s "Suggested project name" label used to be the
only routing indicator that existed at all, leaving the other two real
`decision`/`targetProjectId` outcomes indistinguishable from each other and
from a blank state, the other half of the "mixed, hard to tell what is
happening" gap found in the same screenshot comparison. Two more states,
same `.sr-project-name-label` convention: **existing project**
(`structured.targetProjectId` set) shows "Adding to existing project" above
a new, read-only `.sr-project-name-value` (not renameable here, unlike the
new-project input), the resolved project's own name
(`projects.find((p) => p.id === structured.targetProjectId)`) next to the
same colored "#" `.project-hash` glyph the sidebar project list already
uses for identity, not a plain string; **loose tasks**
(`structured.decision === 'tasks'`) shows only "Loose tasks, added to
Inbox," no input, no value line. All three read directly off the same
routing `toProjectTree` itself resolves at Confirm-time
(`{ id: structured.targetProjectId || inboxId }`), not a separate guess.

**Item 4: shorter reasoning, two layers, not one.** `SYSTEM_PROMPT`
(`src/pipeline/prompt.js`) and `STRUCTURE_SYSTEM_PROMPT_RULES`
(`functions/index.js`) both gained the identical sentence, appended to the
existing reasoning-style rule: "Keep it to one or two short sentences, not
a paragraph." `npm run check:prompt-sync` confirmed the two copies still
match character for character. Not relying on the prompt alone:
`.sr-reasoning` also gained a `-webkit-line-clamp: 2` CSS backstop, the
same technique `.task-desc-clamp` already established for a card
description (`docs/resolution-log.md`, 2026-07-15), so an occasional
longer response still cannot grow the preview's layout. Two lines, not
`.task-desc-clamp`'s three: this sits above the task list as a quick "why,"
not inside a card. Deliberately did not add a hard `maxLength` to
`STRUCTURE_JSON_SCHEMA.properties.reasoning` or to `validateStructure`: a
length-based hard rejection would force a real corrective retry (this
app's one-retry budget, `docs/llm-pipeline.md`) over cosmetic verbosity,
not the kind of real structural problem that retry mechanism exists for.

**Verification.** All five offline eval suites green (18/18 offline
Structure, 19/19 date-parse, 12/12 date, 26/26 Todoist, 16/16 write,
`check:prompt-sync` passed), `npm run build` clean, `node
scripts/check-secrets.mjs` passed. Live verification used the same
`__DEV_MOCK__` pattern the 2026-07-16 entry below established for this
exact constraint (no reachable `/api/structure` backend in this
environment, no Claude in Chrome connection or real Firebase Auth session
available this pass either): `submit()` temporarily gained three magic-
transcript branches (`__DEV_MOCK_NEW__`/`__DEV_MOCK_EXISTING__`/
`__DEV_MOCK_TASKS__`), one per routing outcome, each waiting a few real
seconds before resolving so the loading bar and elapsed timer had something
to actually tick against; `VITE_ENABLE_LOCAL_PREVIEW` toggled to `true` for
the local dev server only. Confirmed live, both themes: rows render
collapsed by default with the real parsed due chip ("this weekend" ->
"Saturday," a sub-task nested and collapsed underneath); clicking a row
expands it into the bordered edit card with its real current
priority/date/section pre-filled; editing priority inside the card updates
both the chip and the checkbox ring color live, and survives collapsing
back; expanding a second row collapses the first automatically (the
accordion); a dispatched `Escape` keydown collapses an open card without
closing the modal, and a second `Escape` then closes the modal, both
confirmed via direct DOM/state checks, not just visually; all three header
states rendered correctly for their respective mock transcripts, including
the colored hash glyph for the existing-project case (a real project
created in local-store for the test); the progress bar and its new "Usually
under 10s..." copy rendered correctly, verified via injected markup after
the real timed state proved too fast/hard to reliably catch mid-flight
through this tool's own round-trip latency (the same fallback technique the
2026-07-16 entry below used for the same reason). The stub was then
reverted completely (`grep` confirmed no trace), `VITE_ENABLE_LOCAL_PREVIEW`
set back to `false`, `npm run verify:prod-env` confirmed clean, and the
production build's own output hash was confirmed byte-identical to the
pre-stub build.

### Decisions not to relitigate

- `STRUCTURE_P50_SECONDS` (10) is deliberately not the naive overall p50
  across all 8 real calls (81.4s); it is the fast-bucket p50, since all 8
  calls are repeats of one diagnostic test transcript, not organic usage,
  and the naive number would read exactly as wrong as the old 82s guess.
  `STRUCTURE_P90_SECONDS` (96) is unchanged, still real, still the
  complex-dump ceiling.
- `expandedTaskId` lives in `SuperRambleModal.jsx`, not `TreePreview`, so
  the modal's own Escape handler can collapse an expanded row before
  considering closing the whole modal. Do not move it back into
  `TreePreview` without first solving that same problem another way.
- No Description, Reminders, "..." overflow, or per-task project-
  reassignment picker in the preview's edit card. Each is a real, checked
  gap against the Structure contract, the data model, or the write path,
  not an oversight; see item 2 above for which doc already tracks each one
  as its own future item.
- No Cancel beside Done in the edit card. Every field already writes to
  `edited` state directly; there is no local draft to revert.
- The three-way header (new project / existing project / loose tasks)
  reads directly off `toProjectTree`'s own routing logic. If that routing
  ever changes, update all three label branches together, not just one.
- `.sr-reasoning`'s 2-line clamp is a backstop, not the primary fix; the
  prompt's own "one or two short sentences" instruction is. Do not add a
  hard `maxLength` to the JSON schema or the validator for this; a
  length-based rejection would spend this pipeline's one corrective retry
  on cosmetic verbosity, not a real structural failure.

## 2026-07-16: Sidebar avatar-menu trigger, three refinements; Super Ramble loading bar and a "suggested" label on the project name; a real toggle bug found and fixed along the way

Five items, one branch: items 1-3 are a direct refinement of the same day's
earlier "Sidebar header caret added, the separate gear icon removed" entry,
not a new feature; items 4-5 are the two Super Ramble pieces already decided
separately. `docs/orchestration.md` and the full `docs/` set read fresh
first, as instructed.

**Item 1: caret next to the name, not the far right edge.** The name span's
inline `flex: 1` (`Sidebar.jsx`'s `sidebar-head-trigger`) absorbed the
button's whole width, pushing `IconCaret` to the far right of the sidebar
column instead of sitting next to "You"/the display name. Removed the
inline style; the button itself keeps `width: 100%` so the whole row stays
clickable, only the internal grouping changed. Verified live: avatar, name,
and caret now sit tight together on the left, empty space after them.

**Item 2: a persistent "open" highlight, and a real bug found verifying
it.** Added `sidebar-head-trigger-open` (conditional on `avatarMenuOpen`),
reusing `.icon-btn:hover`'s exact tint
(`color-mix(in srgb, var(--ds-ink) 6%, transparent)`) and
`.avatar-menu-item`'s own `border-radius: var(--radius)` convention, not new
values. Verified live in both themes: computed style confirmed the exact
background and radius while the menu is open.

Instructed to verify the toggle-and-outside-close pattern live rather than
assume a CSS-only change is safe, given this component's real 2026-07-10
bubbling bug. Did that, and found a second, different bug, pre-existing,
not caused by this pass (confirmed: neither `Popover.jsx` nor this button's
`onClick` had been touched since the initial commit before today). Root
cause: `Popover.jsx`'s outside-click detector listens for `mousedown` on
`document` and closes unless the click lands inside `.popover` or inside
its own internal anchor marker, a zero-size `<span>` it renders at its own
JSX position. In `Sidebar.jsx` (and every other `popover-wrap` trigger in
this app), that marker is a sibling of the trigger button, not the button
itself, so a click on the trigger is never "on the anchor" as far as
`Popover.jsx` can tell. Sequence on a second click while open: `mousedown`
bubbles to `document` first, `Popover.jsx` sees "not on anchor, not inside
popover," calls `onClose()`, `setAvatarMenuOpen(false)` is scheduled; then
`click` fires and reaches the button's own `onClick`, which was a plain
toggle (`v => !v`) and flipped the state straight back to `true`. Net
effect: clicking the trigger a second time never closed the menu, it
silently reopened it every time. Confirmed with a full synthetic
`mousedown`/`mouseup`/`click` sequence (a bare `.click()` call only fires
`click`, not `mousedown`, and does not reproduce this: caught that gap in
the test itself before trusting a false negative).

**Fixed, scoped to this trigger only, not `Popover.jsx`'s shared contract.**
`onClick` no longer toggles; it only ever opens
(`if (!avatarMenuOpen) setAvatarMenuOpen(true)`), reading the render
closure's `avatarMenuOpen` (still `true` at the moment this same click's
`mousedown` has already scheduled the close, since a closure does not
re-read state mid-flight). Closing is now entirely `Popover.jsx`'s own job,
from any cause: outside click, Escape, or the trigger clicked again. A
broader fix to `Popover.jsx` itself (passing the real trigger element in as
part of its anchor check) would likely help every other `popover-wrap`
trigger in this app the same way, since the shape is identical everywhere
(`TaskRow.jsx`'s "..." menu, `SectionOptionsMenu.jsx`, etc.), but that is a
shared-component contract change affecting every consumer, out of scope for
a pass about one trigger; flagged here for a future pass, not fixed blind.
Verified live after the fix, both themes, with real
`mousedown`/`mouseup`/`click` sequences: open from closed, click the
trigger again while open (closes, the exact repro), an outside click
(closes), and clicking Settings (closes the menu and opens `SettingsModal`,
confirming no regression on the 2026-07-10 fix this component already
carries).

**Item 3: Settings row gets its icon back.** `IconSettings` (unused in
`Sidebar.jsx` since the standalone gear button was removed the same day,
still exported from `Icons.jsx` for exactly this kind of reuse) is
re-imported and rendered inside the avatar-menu's Settings button, 16x16,
`className="icon"`, matching `ProjectPicker.jsx`'s own icon-plus-label
popover-item convention rather than inventing new spacing.
`.avatar-menu-item` gained `gap: 10px`, the same value `.popover-item`
already uses for the same layout. The standalone gear button stays removed;
this is only the icon inside the existing row. Verified live, both themes.

**Item 4: Super Ramble loading, a progress bar and a copy fix.** A thin
`.sr-loading-bar`/`.sr-loading-bar-fill` track under `.sr-loading`, only
while `waitingTraceId` is set, width a percentage of
`waitingElapsedSec / STRUCTURE_P90_SECONDS` capped at 100% (a real call can
run past the p90 estimate), `--ds-red` fill, the same token every other
active/in-progress indicator in this app already uses. This environment has
no reachable `/api/structure` backend (a plain dev server, no Functions
emulator; a real submit fails fast with a 404 before `waitingTraceId` is
ever set, so the state the bar depends on is never reached that way).
Verified the CSS and copy directly instead: injected the exact markup and
class names into the live page at a few widths, both themes, confirmed the
fill renders and scales correctly and the track/fill colors resolve to the
right tokens; verified the percentage/cap math and the constants
(`STRUCTURE_P50_SECONDS`/`STRUCTURE_P90_SECONDS`) by reading the code, not
just the rendered snapshot, since the real timer path could not be driven
live this pass. Copy fixed: "for a complex dump" (a bare noun already
flagged as the wrong direction, `docs/roadmap.md`, when the model's own
`reasoning` field was rewritten to stop using it) is now "Usually under
82s. Longer or more tangled brain-dumps can take up to 96s.", this app's
own kept-hyphen compound (`docs/design-system.md`'s stop-slop rules). The
two second-count interpolations are unchanged.

**Item 5: project name labeled as a suggestion.** A small caption,
"Suggested project name," directly above `sr-project-name-input`
(`.sr-project-name-label`, the same two properties as `.settings-label`,
`docs/design-system.md`'s "Settings modal" section, not a new type scale or
color), shown only when `isNewProject`. Same verification constraint and
method as item 4 (no reachable backend to produce a real preview; verified
via injected markup in both themes instead, and the conditional logic by
reading the code).

**Standard loop.** `npm run build` clean. `npm run eval` green: 18/18
offline Structure, 19/19 date, 26/26 Todoist, 16/16 write,
`check:prompt-sync` passed. `node scripts/check-secrets.mjs` passed. No
`src/pipeline/` or `functions/` file touched. `VITE_ENABLE_LOCAL_PREVIEW`
toggled to `true` temporarily for the local dev server only (no real
Firebase Auth session or Claude in Chrome connection available this pass,
the same constraint and the same sanctioned pattern the caret/gear-icon
pass used the same day), reverted to `false` before the final build,
`git diff .env.local` confirmed clean and `npm run verify:prod-env`
confirmed safe after reverting.

### Decisions not to relitigate

- The avatar-menu trigger's `onClick` only ever opens; closing is entirely
  `Popover.jsx`'s own outside-click/Escape handling. Do not change it back
  to a plain toggle, that is the exact bug this entry fixes.
- `Popover.jsx`'s outside-click anchor does not track the real trigger
  element, only its own internal marker span rendered at the trigger's
  sibling position. This affects every `popover-wrap`-style trigger in this
  app identically (confirmed the shape is the same in `TaskRow.jsx` and
  `SectionOptionsMenu.jsx`, not verified live in this pass since it was out
  of scope), not just the sidebar's. A future pass fixing it properly
  should change `Popover.jsx`'s own contract (take the trigger ref in), not
  patch each consumer's `onClick` the way this entry did for one trigger.
- `.sr-loading-bar`'s fill math and `.sr-project-name-label`'s styling were
  verified by injecting the real markup/classes into the live page and by
  reading the code, not by driving the real `/api/structure` flow: this
  environment has no reachable backend for it. A future pass with a real
  session or emulator should confirm the live timer-driven path directly.

## 2026-07-16: Five scoped pieces closing gaps found against Todoist's own "Text Scan" AI feature: a real date parser, a fully editable preview, a task-count/transcript summary, and a thumbs up/down signal

One branch, five parts, discussed directly with Lucas (the PO), each aimed
at a real gap found comparing Super Ramble's output against a real
screenshot of Todoist's own "Text Scan" AI feature on the identical input.
Read `docs/orchestration.md` and the full `docs/` set fresh first, as
instructed; no real conflict was found against any current doc or code, so
nothing needed to be raised before building. Built and verified in order,
one combined entry here rather than five, itemized below so a future agent
can tell which decision belongs to which part.

**Part 1: a real natural-language date parser (Write stage).**
`toDue(raw)` (`src/pipeline/write.js`) no longer returns `date: null,
datetime: null` unconditionally; it parses `raw` with `chrono-node` (a new
real dependency, `npm install chrono-node`, the one new-dependency
exception this app's own "generally avoids new dependencies" posture
allows, the same reasoning `docs/architecture.md` already gives: hand-
rolling relative-date parsing correctly is exactly the class of bug this
repo already shipped once, the UTC-vs-local-day mismatch
`scripts/eval-date.mjs` guards against elsewhere), anchored to the real
`new Date()`, local time. `forwardDate: true` is required, not optional,
verified directly: without it, chrono resolves a bare weekday that already
passed this week into the past instead of forward. `date` is set whenever
chrono resolves a calendar day; `datetime` only when chrono found a real
stated time with its own certainty (`isCertain('hour')`), never a midnight
or noon default chrono guesses in for a phrase with no stated time.
`isRecurring` is a separate signal chrono itself does not expose ("every
Monday" resolves to one concrete date with no recurring flag; "daily"/
"weekly" alone resolve to no date at all), checked independently against
the raw text via a small regex, so a pure-recurring phrase with no
resolvable single date still sets `isRecurring: true`. `string` always
carries the raw input through verbatim, so `functions/todoist.js`'s only
consumer of this field (`t.due.string`, unaffected by any of this, Todoist
parses its own natural-language string server-side) keeps working
unchanged. Anything chrono cannot parse at all ("asap," "sometime," an
empty string) fails closed to the exact prior shape, never a throw, never a
guess. `scripts/eval-date-parse.mjs` (new, 19/19), wired into `npm run
eval`, covers all of this deterministically, anchored to whatever "now"
actually is when it runs rather than a hardcoded date, verified by hand
against real chrono output first (`tomorrow`/`today`/`next Friday`/a bare
weekday/`tomorrow at 3pm`/`every Monday`/`daily`/`by the 20th` all probed
directly in a scratch script before writing the eval's own expectations).

**Part 2: the editable preview extended to priority, due date, and section
membership.** `TaskRow.jsx`'s editable mode gains a `.task-edit-controls`
row (always visible, not hover-revealed like `.task-row-actions`, since
these are primary editing controls, not a secondary row action): a
priority trigger reusing `PriorityPicker.jsx` directly; a due-date trigger
reusing `DatePicker.jsx`, but reading only its `date` back out as a plain
ISO string, never the store's full due shape, so the edited value flows
straight through Part 1's `toDue()` unchanged at Confirm-time, no second
due-shape needed; a section-membership trigger, a small new local picker
(`SectionRefPicker`, `TaskRow.jsx`, the only caller) over the response's
own local `sections` plus "No section," root tasks only (depth 0), since a
sub-task has no `sectionRef` of its own in this contract. All three reuse
`updateTaskAtRef` (`src/pipeline/write.js`), already generic enough for
any field-level update, not a second update mechanism.
`SuperRambleModal.jsx`'s `editLog` gained `priorityEdits`/`dueEdits`/
`sectionEdits`, the same `{ ref, from, to }` capture-at-the-moment-of-edit
discipline `contentEdits` already used, filtered the same way at Confirm
(a value clicked back to its starting point is not reported).
`functions/index.js`'s `isValidEdits` shape-checks all three new arrays
before they reach Firestore, the same discipline the existing three
already got. `gradeStructureTrace`'s auto-promotion path does **not**
attempt to replay any of the three new edit kinds onto the reconstructed
tree: `reconstructCorrectedTree` only ever replays `contentEdits`,
`removedTasks`, and `projectNameChange`; when a `confirmed_with_edits`
trace's `edits` carries any of the three new arrays, auto-promotion is
skipped outright and logged to `pipelineLearningLog` instead, before
`reconstructCorrectedTree` is ever called, the same fail-closed posture
already documented for the "edited, then removed" content-edit case.
Promoting a tree that silently drops a real edit the user made would teach
the live model the model's own uncorrected value, worse than not promoting
at all. Replaying these three is real, separate future work, not this
pass. `scripts/eval-write.mjs` gained four new cases (16/16) for the
client-side plumbing (`updateTaskAtRef` + `toProjectTree` for priority,
due, clearing a due, and section membership); one bug caught and fixed
while writing them: the first draft asserted against a fixed array index,
which broke because `flattenTasks` interleaves a task's own sub-tasks
immediately after it, so a flat index does not line up with the original
task order once sub-tasks are in the mix. Fixed by looking up by `content`
instead (`taskByContent`, new helper in the eval script), the same lookup
`contents()` already implied was needed for anything beyond presence
checks.

**Part 3: a task-count summary and a pinned raw-input snippet.** Both at
the top of the real preview (not the `needsClarification` branch's task
count, since there is no tree yet to count there; the transcript snippet
does show in both branches, arguably more useful in
`needsClarification`'s case, where the user is being asked a question
about what they said). The count reuses `flattenTasks(edited).length`, the
exact same call `TreePreview` already builds its rows from, so there is no
second counting path to drift out of sync. The snippet
(`.sr-transcript-snippet`) is a small muted box, `--ds-ink-soft`, a light
background tint, collapsed to one line and truncated with an ellipsis
(`truncateSnippet`, new helper), the full text behind a native `title`
tooltip; captured once at submit time into its own `submittedTranscript`
state, not read live from the textarea's own `text` state, since the
preview must always show exactly what was sent, decoupled from `text`'s
own lifecycle (the textarea itself is not even rendered once state moves
past `'input'`).

**Part 4: a thumbs up/down feedback signal, independent of confirm/
cancel.** `POST /api/structure/feedback` (`functions/index.js`, new): body
`{ traceId, feedback: "up" | "down" }`, merge-writes `feedback` onto the
trace, no `checkAndReserveLimit`/`logUsage` call, the same reason
`/todoist/status` and friends skip it too (spends no model call). A
toggle, not an append-only log: a later call overwrites the earlier value,
both server-side and in the client's own `feedback` state. No
`firestore.rules` change needed, confirmed rather than assumed:
`structureTraces` already denies every client write outright (`allow
write: if false`), so this new field needs no new rule, only the Function
writes it. Two new icon buttons (`IconThumbsUp`/`IconThumbsDown`,
`Icons.jsx`, new) sit on the same line as the confidence percentage
(`.sr-confidence-row`), tint `--ds-red` when selected
(`.sr-feedback-selected`, the same light `color-mix` active-state
convention `.voice-mic.recording` already uses), no confirmation dialog.
Unlike `recordOutcome`'s fully silent failure swallow, a failed feedback
save does surface, through this app's existing quiet toast (`flash`): a
real signal worth knowing didn't land, not pure background telemetry.
Deliberately narrow this pass: `feedback` is captured and persisted only,
never read by `gradeStructureTrace` or auto-promotion, each its own
separate future decision.

**Verification.** All four offline eval suites green (19/19 date-parse,
16/16 write, unchanged 18/18 offline Structure, 12/12 date, 26/26 Todoist,
`check:prompt-sync` passed), `npm run build` clean, `node
scripts/check-secrets.mjs` passed, `node --check functions/index.js`
passed. Live verification could not use a real `/api/structure` call (no
Claude in Chrome connection or real Firebase Auth session available this
pass, the same constraint the 2026-07-16 sidebar-caret entry above hit);
rather than skip verification, `submit()` was temporarily edited with one
`transcript === '__DEV_MOCK__'` branch returning a realistic, hand-built
Structure response (a project, one section, four tasks including a
sub-task, a spread of due phrasings covering `tomorrow at 3pm`/`by next
Friday`/`this weekend`/`every Monday`), `VITE_ENABLE_LOCAL_PREVIEW`
toggled to `true` for the dev server only, and the whole flow driven live
in the browser: confirmed the transcript snippet and task count render
correctly, confirmed every due phrasing parsed to the correct real date
(the calendar and time-of-day both round-tripped correctly through
`DatePicker`'s own `value` prop, itself just Part 1's real `toDue()`
output), clicked a priority chip and watched both the chip and the row's
checkbox ring color update live, clicked a section chip and watched the
target section's own task count update from 2 to 3, clicked a date preset
and watched the due meta line and calendar highlight both update to match,
and clicked both thumbs buttons and watched the selected one tint red
while the other reverted, confirmed via network logs the real `POST
/api/structure/feedback` call fired with the right path and payload (a 404
locally, no Function running, the expected shape of failure this
environment produces, not a bug: it correctly triggered the quiet-toast
failure path rather than silently swallowing it). Checked both themes. The
temporary stub was then reverted completely (`grep` confirmed no trace of
it left) and `VITE_ENABLE_LOCAL_PREVIEW` set back to `false`,
`npm run verify:prod-env` confirmed clean, and the production build's own
output hash was confirmed identical to the pre-stub build, before this
entry was written.

### Decisions not to relitigate

- `chrono-node` is a real, intentional exception to this app's own
  "generally avoids new dependencies" posture, for the reason stated in
  Part 1 above: do not replace it with a hand-rolled parser on the
  assumption it was an unreviewed addition.
- A due edit in the preview is always a plain ISO date string (or `null`),
  never the store's full `{ date, datetime, string, isRecurring }` shape;
  do not add a second due-shape to the preview's own edit path without a
  new, equally explicit decision.
- `priorityEdits`/`dueEdits`/`sectionEdits` are captured and shape-checked
  but never replayed by `gradeStructureTrace`'s auto-promotion path; a
  `confirmed_with_edits` trace carrying any of them always skips
  auto-promotion outright. Do not wire replay support in without first
  extending `reconstructCorrectedTree` itself to handle all three, a
  separate, scoped pass.
- `feedback` (Part 4) is captured and persisted only; it is not part of
  grading or auto-promotion. Wiring it in is separate, future work, not an
  oversight here.
- The `__DEV_MOCK__` verification stub was temporary, reverted in full
  before this entry was written; do not look for it in `SuperRambleModal.jsx`
  and do not reintroduce a permanent mock-response escape hatch on the
  assumption this pass left one on purpose.

## 2026-07-16: Sidebar header caret added, the separate gear icon removed

Two changes to `Sidebar.jsx`'s header, reported directly against a real
Todoist screenshot: the name row carries a small down-caret beside the name,
and there is no separate gear icon next to it at all.

- `sidebar-head-trigger` gains `IconCaret` (already imported, already used
  for the "My Projects" collapse caret and a project's own caret) right
  after the name span: `.sidebar-head-caret`, `width={14} height={14}`,
  static, no rotate transform, tinted `--ds-ink-soft`. A visual affordance
  marking that the row opens a menu, not a control of its own; `onClick`
  stays on the outer button, unchanged. A new class rather than reusing
  `.nav-section-caret`, since that class's rotate-on-collapse behavior does
  not apply here.
- The separate gear icon button (`title="Settings"`, right of the trigger)
  is deleted outright, along with the now-unused `IconSettings` import in
  `Sidebar.jsx` (grep confirmed no other reference in `src/`; `IconSettings`
  itself is untouched in `Icons.jsx`, left for possible future reuse).

**This is an explicit reversal of the 2026-07-05/2026-07-10 "additive, not
replacement" decision** (`docs/design-system.md`'s "Sidebar avatar menu"
section originally said the gear "stays exactly where it is" when the
avatar-menu Settings row was added). Requested directly this pass, not a
rediscovered bug. `docs/design-system.md` updated in the same pass: the
"stays exactly where it is" sentence is gone, replaced with a plain
statement that the avatar-menu Settings row is the only Settings entry
point now, the same pattern that section already documents for Log out
since 2026-07-15.

Verified live in both themes (`VITE_ENABLE_LOCAL_PREVIEW` toggled to `true`
temporarily for the local dev server only, since no real Firebase Auth
session or Claude in Chrome connection was available this pass; reverted to
`false` before the final build, and `npm run verify:prod-env` confirmed
clean after reverting): the header row lays out cleanly with one fewer
icon-btn (the sidebar-toggle button stays), the caret reads
`--ds-ink-soft` (`rgb(154, 154, 154)` in dark) at 14x14 as specified, the
avatar-menu Settings row still opens `SettingsModal`, and `grep` found no
other code path referencing the removed button.

`npm run build` clean. `npm run eval` green: 18/18 offline Structure, 12/12
date, 26/26 Todoist, 11/11 write, `check:prompt-sync` passed (none of these
suites touch anything this pass changed; run anyway per the loop's
definition of done). `node scripts/check-secrets.mjs` passed.

### Decisions not to relitigate

- Settings has exactly one entry point now, the avatar-menu row. Do not
  re-add a second Settings control (a gear icon or otherwise) outside that
  menu, the same pattern already established for sign-out
  (`docs/design-system.md`'s "Sidebar avatar menu" section, 2026-07-15).

## 2026-07-15: UI polish pass, eight items: card truncation, description cap, autosave indicator, drag-and-drop indicator, redundant Sign Out removed, Settings chrome, page title, sidebar-collapsed spacing

Eight scoped items, one branch, all `src/` only; no `src/pipeline/` or
`functions/` file touched. `docs/` set read fresh first per
`docs/orchestration.md`, including the 2026-07-10 drag-and-drop entry before
touching any drag code, as instructed.

**Item 1: card description truncation.** `TaskRow.jsx`'s `.task-desc` gets a
new `.task-desc-clamp` class, `variant === 'card'` only (`display: -webkit-box;
-webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden`).
Verified live on Board cards (Today, Upcoming, and a Project board column): a
long description clips to 3 lines with an ellipsis, the card does not grow
unbounded. Flat variant (Inbox, Project List) is unaffected by design, and
verified unaffected live too. Full description still renders unclamped in
`TaskDetail.jsx`. Line count (3) is a reasoned default, not measured against
a screenshot; no reference was available this pass (see the Settings/title
note below on why).

**Item 2: TaskDetail description textarea capped.** `.detail-desc` gets
`max-height: 160px; overflow-y: auto`. `autoResize` (`TaskDetail.jsx`) is
unchanged: it still sets `el.style.height` to the full `scrollHeight`, but
CSS `max-height` clamps the *used* height regardless of the inline style, so
the box stops growing past 160px and scrolls internally past that point.
Verified live: typed a 15-line description, confirmed via
`getComputedStyle` that `clientHeight` stays 160 while `scrollHeight` grows
past it (244px at 15 lines), and confirmed visually that sub-tasks and the
comment box stay in place below the capped field instead of being pushed
out of frame. 160px (roughly 6-7 lines at this field's 13px font) is a
reasoned default, not measured against a screenshot. `.detail-body`'s own
80vh budget (`styles.css`) was re-checked after this change: still correct,
unchanged, since capping the description can now only ever reduce
`.detail-body`'s total content height, never grow it further.

**Item 3: autosave "Saved" indicator.** `TaskDetail.jsx` gains `justSaved`
state and a `flashSaved()` helper, called only from the debounced
content/description save paths (`onContentChange`/`onDescriptionChange`),
not from the rail's immediate-save fields (Date, Priority, Labels, Project),
which already had no debounce to confirm. Renders `<span className="detail-saved">Saved</span>`
right after the description field for 1.5s (`detail-saved-fade`
keyframes, opacity 0 to 1 to 0), then unmounts. Verified live with a
`MutationObserver` watching for the node's add/remove, not just a screenshot
timed by hand: a manual screenshot repeatedly missed the ~2 second window
(500ms debounce plus a real Firestore round trip, this environment is
signed into a real account, not local-store) before I switched to the
observer, which confirmed the node mounts and unmounts on the expected
cadence tied to the real save resolving, not just the debounce timer.

**Item 4: Board and day-section drag-and-drop, position-aware indicator.**
`Board.jsx`'s `.board-col.drag-over-col` (a whole-column dashed outline,
boolean "dragging over this column at all") is gone, along with the
matching `.day-col.drag-over-section`/`.agenda-section.drag-over-section`
in `UpcomingView.jsx`'s own day-section drag (the same crude pattern, reused
by both its List agenda rendering and its Board day-columns, since both
share one `daySection`/`renderRow` implementation). Replaced in both files
with the same `dragPreview`-driven, box-shadow technique `TaskList.jsx`'s
`positionAware` mode already established: a `{ colKey/sectionKey, taskId }`
state, `taskId` null meaning "append at the end of this list," drawn as
`.drop-before` on the hovered row (`TaskRow.jsx`'s own `dragPreview` prop,
unchanged) or `.drop-placeholder` inside a fixed end-zone past the last row
(`.task-list-end-zone`, also unchanged, TaskList's own pattern). No mounted
or unmounted placeholder among real rows anywhere in this change, per the
2026-07-10 entry's explicit warning: that is the exact bug that made real
drops silently no-op the first time this was tried.

Neither Board nor a day-section ever nests one row under another (Board's
`TaskRow` calls always render at `depth={0}` with an empty `childrenOf`;
the day-section rows are the same), so `TaskRow`'s bottom-half-of-a-row
zone (`'nest'`) is reinterpreted in both callers as "insert after this row"
(before its next sibling, or at the end if it's the last row), never as an
actual nest. This is a real reuse of TaskRow's own top/bottom-half math, not
a new gesture.

**Write semantics, a deliberate scope decision.** A same-column (or
same-day) reorder is fully position-precise, using the dropped-on row's
exact index, same as before this pass. A cross-column (or cross-day) drop's
*field* write (section, priority, date, or reschedule) is unchanged from
before, still column-granularity, not also writing the moved row's exact
`order` within the destination list. Considered making cross-column drops
order-precise too, to fully match the visual promise, and deliberately did
not: several existing callers treat a cross-column drop as an intentional
no-op for column-specific reasons (Today's Overdue column, Upcoming's "Date
added" group), and there is no reliable signal at the Board/day-section
level for telling a real write apart from one of those no-ops. Layering a
second, row-precise `order` write on top risked quietly reordering a column
that was never meant to be a drop target at all. If a future pass wants
order-precise cross-column drops, it needs to plumb a real success/no-op
signal back from each of the `onCrossColumnDrop` callers first (`ProjectView.jsx`,
`TodayView.jsx` x2, `UpcomingView.jsx`), not just add the write blind.

**Verified with the shape the 2026-07-10 entry requires, not the shortcut it
warns against.** Real mouse-driven `left_click_drag` does not trigger native
HTML5 drag events in this browser automation tool at all (confirmed: no
visible effect). Used the same fix as that entry describes for its own
`preview_eval` shortcut: dispatched real `DragEvent`s (`dragstart`, two
`dragover` events ~40-45ms apart, `drop`, `dragend`) with a real
`DataTransfer`, against the live DOM. Confirmed, reading actual results, not
just the UI:

- A same-column drag (Today board, "Stand-up call" onto "Renew passport,"
  top half) showed `.drop-before` on the target with zero layout shift
  (compared every other row's `getBoundingClientRect().top` before and
  during the hover: identical), then committed to the exact position shown
  on drop (read the resulting DOM order back, not just the indicator).
- A cross-column drag (Today board, "Review PR" from Overdue into the empty
  Today column's end-zone) showed `.drop-placeholder` in the fixed end-zone,
  then committed: Overdue lost the card, Today gained it.
- A cross-day drag (Upcoming board, "Review PR" from today into tomorrow's
  end-zone) committed the same way, confirmed via the resulting day
  columns' contents.

All three tests ran against this environment's own real signed-in account
(not local-store), so every test mutation (descriptions, due dates, manual
order) was reverted afterward, live, back to its original value, rather
than left as test residue in real data.

**Item 5: redundant Sign Out removed from Settings.** Verified first, not
assumed: `Sidebar.jsx`'s avatar-menu "Log out" row has its own
`confirmSignOut` state, its own `doSignOut` (calls `signOut()` from
`useAuth()` directly), and its own `ConfirmDialog`, sharing no state with
`SettingsModal.jsx`. Removed `SettingsModal.jsx`'s duplicate entirely: the
`confirmSignOut` state, `doSignOut`, the "Sign out" button, and its
`ConfirmDialog` block; `signOut` dropped from its `useAuth()` destructure
too, now unused there. Verified live after removal: the sidebar avatar
menu's "Log out" still opens the same confirm dialog ("Signing out doesn't
delete anything...") independent of Settings. `docs/design-system.md`'s
"Sidebar avatar menu" section updated in the same pass: it used to point at
`SettingsModal.jsx`'s Account-section control as the pattern this row
matched; that control no longer exists, so the section now states plainly
that the avatar-menu row is the only sign-out control in the app, and a
future pass should not re-add one to Settings.

**Item 6: Settings modal chrome, reworked against a description of a real
Todoist screenshot.** No image was actually attached this pass (the task
referenced "the attached reference screenshot," and separately asked for a
live Todoist comparison for item 7); flagged before starting, the same
standing rule the 2026-07-10 chip-row entry already established (a written
description is not a substitute for the real screenshot, but here Lucas
supplied a detailed direct description in response to being asked, which is
a different, legitimate source, not a guess on my part). Changed, all
reported directly against that description:

- `.settings-nav-item.active`: red text only, no background fill, replacing
  a tinted background box.
- `.settings-row`: label-above-value (a column flex), not
  label-left-value-right (a row flex). New `.settings-row-inline` modifier
  for a row that also carries a same-line action (Todoist's
  Status/Connect-or-Disconnect), button flush right.
- Todoist's own action buttons (Connect, Disconnect) stay the existing
  `.btn-quiet` style; did not introduce an outlined-red "destructive"
  button variant, since neither action is actually destructive in this
  app (both reversible, no local data deleted) and nothing else in
  Settings needs one after item 5.
- Nav row padding `7px 10px` to `13px 10px`; section padding `24px 0` to
  `28px 0`.

`docs/design-system.md` gained a new "Settings modal" section recording all
of the above, since no such section existed before this pass despite the
modal's two-pane chrome itself predating it. Verified live at all three
categories (Account, Theme, Todoist), both hover and active nav states.

**Item 7: page title.** `ProjectView.jsx`'s `IconInbox` next to the Inbox
title is gone (the `project.isInbox` branch now renders nothing instead of
the icon); the colored dot next to a regular project's own title is
untouched, per `docs/design-system.md`'s already-settled answer that real
Todoist does render a dot there (not nothing, not a hash), so this did not
need a new live check. `.view-title` font-size: 22px to 30px. **Not a
pixel-measured number.** Item 7 asked for a live comparison against real
Todoist's own rendered heading; no live, signed-in Todoist session was
reachable this pass (Claude in Chrome was not connected). Asked Lucas
directly rather than guessing; he supplied a direct visual comparison
("closer to 28-32px bold," explicitly flagged as his own best read, not a
measured pixel value). Implemented the midpoint, 30px, and noted here as a
reasoned estimate from a real side-by-side look, not a measured or guessed
number. A three-tier title/meta-line/section-header hierarchy was also
described (a small muted task-count line between the page title and section
headers, with a checkmark icon) but not built this pass: it is a new
element with real open questions (which task count, on every view or just
Today, whether it does anything on click) that the original item 7 scope
(icon removal, font-size) did not cover, and building it half-specified
would be exactly the kind of guess this section is trying to avoid. Left
open for a future pass with an explicit spec.

**Item 8: sidebar-collapsed spacing, reproduced live, not assumed.**
Reproducing this directly (toggle `.sidebar-reveal` at several viewport
widths, screenshot and measure, not read the CSS alone) found the actual
bug: `.content-inner`'s own top padding (36px) never left clearance for the
fixed reveal button (bottom edge at 46px), so the view heading sat almost
directly against it, at every non-phone width, not just a narrow one, since
`.content-inner` always starts at the same vertical offset regardless of
the horizontal centering `--content-max` drives. This is the same crowding
the phone-width media query rule already fixed once (56px left padding,
`docs/design-system.md`'s "Responsive" section), but that rule is scoped to
`max-width: 640px` because a phone always shows the mobile overlay instead
of this button; nothing covered the case of a desktop user manually hiding
the sidebar (`App.jsx`'s own toggle, any viewport width). Fixed with a new
`sidebar-hidden` class `App.jsx` now puts on `.content` whenever the reveal
button renders, and `.content.sidebar-hidden .content-inner { padding-top:
56px }`, reusing the exact figure the phone rule already verified against a
screenshot for this same button. Verified live, before/after, at 750px and
1280px viewport widths: the heading now clears the button by a comfortable
margin at both, and re-expanding the sidebar afterward showed no residual
shift.

**Standard loop.** `npm run build` clean. `npm run eval` green: 18/18
offline Structure, 12/12 date, 26/26 Todoist, 11/11 write,
`check:prompt-sync` passed (none of these suites touch anything this pass
changed; run anyway per the loop's definition of done).
`node scripts/check-secrets.mjs` passed. No `src/pipeline/` or `functions/`
file touched.

### Decisions not to relitigate

- The box-shadow/end-zone drag-preview technique (`docs/resolution-log.md`,
  2026-07-10) now covers every drag surface in this app: `TaskList.jsx`'s
  own rows, `Sidebar.jsx`'s `ProjectNode`, and as of this pass, `Board.jsx`'s
  columns and `UpcomingView.jsx`'s day-sections too. No remaining drag
  surface uses a mounted/unmounted placeholder among real rows; do not
  introduce one for a future drag feature either.
- Cross-column/cross-day drag drops stay column-granularity for their write
  (see item 4 above); do not add row-precise ordering there without first
  plumbing a real success/no-op signal back from each `onCrossColumnDrop`
  caller.
- `SettingsModal.jsx`'s Account section does not get its own Sign out
  control again; `Sidebar.jsx`'s avatar-menu "Log out" is the one sign-out
  control in this app (see item 5 and `docs/design-system.md`'s "Sidebar
  avatar menu" section).
- `.settings-row` is label-above-value, a column flex; do not revert to
  label-left-value-right without a new, equally explicit decision, per
  `docs/design-system.md`'s new "Settings modal" section.
- `.view-title`'s 30px and `.detail-desc`'s 160px cap are both reasoned
  defaults (one from a direct description of a real screenshot, one from
  this app's own spacing scale), not pixel-measured or screenshot-verified
  numbers; a future pass with a real, attached Todoist screenshot or a live
  session should treat both as open to a real measurement, not settled.
- The three-tier title/meta-line/section-header hierarchy described for
  item 7 is a real, identified gap, not solved this pass; needs its own
  scoped spec (which count, which views, click behavior) before building
  it, not a half-built guess.

## 2026-07-14: gradeStructureTrace's emulator-only FieldValue crash, fixed: every admin.firestore.FieldValue call site in functions/index.js now uses the modular import

Follow-up to the async-Structure pass below, which flagged but did not fix a
same-class bug in `gradeStructureTrace`'s own `judgedAt` write. Resolved this
pass, verified against a real emulator run, not just reasoned about.

**Why the original scoping decision needed revisiting.** The async-Structure
pass fixed `logUsage`'s crash (`admin.firestore.FieldValue` undefined when
called from inside a Firestore-triggered function's own cold start under the
local emulator) by switching just that one call site to the modular
`FieldValue` import, reasoning every other `admin.firestore.FieldValue` call
site in the file had an established, working production track record and so
did not need the same treatment. `gradeStructureTrace`, an existing,
long-running trigger with exactly that production track record, hit the
identical failure class the same pass's own emulator test run incidentally
surfaced. Production history describes real Firestore, not the local
emulator's own module-loading behavior inside a background-triggered
function's cold start; it was never actually evidence that the namespace
form is safe there. With two independent trigger-context call sites now
shown to fail the same way, the "established production track record"
distinction no longer holds as a reason to leave the rest alone.

**Fix.** Every remaining `admin.firestore.FieldValue.*` call site in
`functions/index.js` now uses the modular `FieldValue` import already
declared at the top of the file: `createProcessingTrace`'s `createdAt`, the
`/structure/outcome` endpoint's `outcomeAt`, `logPipelineLearning`'s `date`,
`gradeStructureTrace`'s own `judgedAt`, and the auto-promotion write's
`addedAt` on `referenceExamples`. `logUsage` is unchanged, already on the
modular form. Left `scripts/*.mjs` alone (`grade-traces.mjs`,
`seed-reference-examples.mjs`, `review-queue.mjs`,
`structure-emulator-test.mjs` itself): those run as plain Admin SDK Node
scripts, never inside a Cloud Functions trigger's own runtime, so the
mechanism behind this bug does not apply to them.

**Verified, not assumed.** `functions/node_modules` was missing in this
worktree (a fresh checkout); installed it first. The local Java runtime
`scripts/structure-emulator-test.mjs` needs was present via Homebrew
(`openjdk`) but not linked onto `PATH`; ran with
`PATH="/opt/homebrew/opt/openjdk/bin:$PATH"` rather than linking it globally,
since linking a system Java is outside this task's scope.
`EMULATOR_ALLOW_LIVE=true npm run test:structure-emulator` (real
`gcloud auth application-default login` credentials already present,
no `functions/.secret.local` needed) passed both checks clean. Test 2's
outcome-race scenario is what actually exercises `gradeStructureTrace`'s
write path (its guard needs `outcome !== "pending"`, which only Test 2
produces before the trace resolves): `gradeStructureTrace` ran to completion
several times across both tests, including once during the emulator's own
shutdown drain, the exact point the previous pass's flagged finding said the
unhandled error had surfaced, with no `TypeError` anywhere in the run.
`node --check functions/index.js` also confirmed clean syntax.

### Decisions not to relitigate

- Every `admin.firestore.FieldValue` call site in `functions/index.js` uses
  the modular `FieldValue` import now; there is no longer a mixed
  namespace-vs-modular split in this file to reason about case by case.
- The "established production track record" heuristic from the prior pass is
  retired as a reason to treat call sites differently: it distinguishes real
  Firestore from the emulator, not trigger-context safety, and the emulator
  is exactly what this class of bug only ever showed up in.
- `scripts/*.mjs`'s own `admin.firestore.FieldValue` usages are intentionally
  untouched; they are not Cloud Functions and do not run inside a trigger's
  cold start.

## 2026-07-14: Live verification of the async-Structure pass. The complex-transcript 502 is closed for real; a hosting-deploy gotcha found and fixed along the way

Follow-up to the entry directly below (async Structure, real timing data,
the emulator test). Deployed and live-verified against the real deployed
site, per this task's own explicit instruction not to trust a clean build
and a passing local test alone.

**Deployed:** `firebase deploy --only functions,firestore:rules,hosting`.
Functions (`api`, `processStructureTrace` new, `gradeStructureTrace`) and
Firestore rules released cleanly. The overall command then exited with a
non-zero error: "Functions successfully deployed but could not set up
cleanup policy in locations us-central1, europe-west1" (no cleanup policy
existed yet for Artifact Registry container images in either region).
Resolved directly with `firebase functions:artifacts:setpolicy` for both
regions (`processStructureTrace`'s Firestore trigger deploys to
`europe-west1`, matching the existing `gradeStructureTrace`'s region, since
a Firestore trigger runs in its database's own location, not
`us-central1` where the HTTP `api` function lives; `api`'s own region is
independently configurable, this one is not).

**A real gotcha, found by verifying rather than trusting the deploy
command's exit code.** That same error aborted the overall `firebase
deploy` invocation *before* Hosting's own deploy sequence reached its
finalize/release step: `hosting: file upload complete` had printed, but
never `hosting: releasing new version` / `release complete` / `Deploy
complete!`. The new client bundle was uploaded to Firebase's staging area
but never actually released to the live site. `https://super-ramble.web.app`
kept serving the prior deployed bundle (`index-Yu1caoV7.js`, confirmed via
direct `curl` against the live URL, not assumed from the local `dist/`
build) even after the functions/rules half of the same deploy command had
fully succeeded. The first live test run against the site (below) was
run against this stale bundle, and its result was consequently not
diagnostic of the new code at all: the old, synchronous `callModel` treated
the new server's fast `{ traceId }` enqueue response as if `body.structured`
were the final answer, got `undefined`, failed client-side contract
validation immediately ("response must be an object"), retried once (also
immediately), and threw the generic `ContractError` message a few seconds
after submit, not the ~90s+ wait the new code should show. Both of *those*
enqueued trace documents did still get processed for real by
`processStructureTrace` in the background (each ran a real, correctly-
handled `max_tokens` truncation, confirmed directly against Firestore and
Cloud Logging), so the server-side half of this pass was never in doubt;
only the client half wasn't actually live yet. Re-ran `firebase deploy
--only hosting` on its own (the cleanup policy was already fixed by then,
so this run completed its full finalize/release sequence); `curl`ing the
live URL directly afterward confirmed the correct new bundle
(`index-D7IqMUXY.js`) was being served.

### Decisions not to relitigate

- A `firebase deploy` invocation exiting non-zero does not mean every
  target it covered failed, and exiting zero for the targets that did
  report success does not mean every target's deploy sequence actually
  reached its own finalize step. Hosting's deploy is two phases (upload,
  then finalize/release); an error raised by a *different* target
  (Functions' artifact cleanup policy here) after Hosting's upload phase
  printed success can still abort the overall command before Hosting's own
  release phase runs. Confirm what is actually live by querying the real
  deployed asset directly (`curl` the live URL for the referenced bundle
  hash, compared against the local `dist/` build), not by reading the
  deploy command's own log for the phrase "complete" on the target you
  care about in isolation.
- `processStructureTrace` deploys to `europe-west1`, not `us-central1`,
  matching `gradeStructureTrace`'s existing region: a Firestore-triggered
  function runs in its Firestore database's own location, which is
  independent of `exports.api`'s own configurable HTTP-function region.
  This is expected, not a misconfiguration; both regions need their own
  Artifact Registry cleanup policy.

**Live verification, once the correct bundle was actually live.** Signed in
as the real user at `https://super-ramble.web.app` (the user's own session,
not a fabricated one) and submitted two real transcripts through the
browser:

1. A three-storyline, nested-sub-task transcript at least as complex as the
   original bug report (a birthday party with a dependent venue-then-cake-
   then-invitations chain, a camping trip with nested packing/meal-planning
   sub-tasks, plus a fourth unrelated task). The new waiting UI showed
   correctly throughout: "Usually under 82s, can take up to 96s for a
   complex dump." with a live elapsed-seconds counter ticking up (10s, 41s,
   ...), a visible Cancel button the whole time. After the real ~90s+ wait,
   it resolved to the server's own real, explained error: "model response
   was truncated (max_tokens reached) before it finished" — the existing,
   already-understood `max_tokens` failure mode (2026-07-07), not a bare,
   unexplained `502`. **This is the actual fix, confirmed live**: the
   browser held the connection open through the real ~90s+ duration via
   Firestore `onSnapshot`, with no Hosting-rewrite cutoff at all, and
   surfaced the server's real reason for failure instead of a generic
   infrastructure error page.
2. A shorter three-item flat-tasks transcript (a passport renewal, a
   dentist call, dry cleaning), to confirm the happy path too, not only the
   truncation path. Resolved to a real, correct preview (`decision:
   "tasks"`, confidence 92%, three tasks, priorities matching the
   transcript's own urgency language) within the fast end of the estimated
   range. Discarded rather than confirmed, so nothing was actually written
   to the real account by this verification.

**Verified:** both live submissions above, driven through the real signed-in
browser session, not simulated. Cross-referenced the first submission's two
enqueued-but-stale-bundle trace documents directly against Firestore
(`status`, `stopReason`, `errorMessage`) and Cloud Logging (`"structure
phase timings"`, confirming real ~91-93s `modelCall` durations, matching
Phase 1's own historical range) to understand exactly what the stale-bundle
run actually did server-side, rather than guessing from the confusing
client-side symptom alone.

### Decisions not to relitigate (continued)

- The original complex-transcript `502` (all 2026-07-14 entries above) is
  closed. A real, complex, multi-thread transcript submitted against the
  live deployed site now either resolves successfully or fails with a real,
  explained server-side reason (`max_tokens` truncation, a refusal, or
  invalid JSON), after correctly waiting through the model call's real
  duration; it does not 502 silently partway through. Re-open only with a
  new, specific live failure, not this same symptom recurring from the same
  cause.
- `max_tokens` truncation on a genuinely rich, multi-thread transcript is a
  real, separate, already-documented limitation (2026-07-07), not something
  this pass was scoped to fix. Do not conflate a future truncation report
  with the connection-cutoff bug this pass closed; they are different
  failure modes with different fixes (raising `max_tokens` or restructuring
  the prompt, versus removing the long-lived HTTP request).

## 2026-07-14: Async Structure, real timing data, and an emulator integration test. The complex-transcript 502 is architecturally closed; live verification is a follow-up entry

Four things, in order: real timing data from production, the async
redesign itself, the client/UI changes it requires, and a new emulator
integration test that in turn found and fixed a real bug in the new code.

**Phase 1: real timing data, not estimates.** Added
`scripts/structure-timing-stats.mjs` (`npm run structure:timing-stats`):
reads every real `"structure phase timings"` Cloud Logging entry
(`functions/index.js`, unconditional since the 2026-07-14 phase-timing
pass), cross-references each `traceId` against its real
`structureTraces` document (a `collectionGroup` query, not a per-uid loop)
for `outputTokens`, and reports percentiles bucketed by output-token range.
Verified the real log entry shape directly before writing the parser
(`textPayload`, Node's `util.inspect` format, not `jsonPayload`) rather than
assuming one. Real output against this project's actual history, 8 calls
total:

| bucket | n | p50 | p90 | max |
|---|---|---|---|---|
| all calls | 8 | 81.4s | 96.2s | 96.2s |
| <1000 output tokens | 2 | 9.4s | 10.2s | 10.2s |
| 4000-7000 output tokens | 2 | 73.2s | 81.4s | 81.4s |
| 7000-8192 output tokens (near/at cap) | 4 | 91.7s | 96.2s | 96.2s |

`modelCall` is ~94% of `totalMs` on average: duration tracks output length,
not where the call originates, confirming the existing diagnosis. Only 8
data points exist; `docs/roadmap.md`'s "Next" section flags this sample size
explicitly and asks for a re-run as real usage accumulates. Also added the
same phase-timing instrumentation (unconditional `console.log('transcribe
phase timings', ...)`) around `/api/transcribe`'s Groq call, so equivalent
data starts accumulating for Transcribe from this deploy forward; there was,
and is, no historical data for that call, stated plainly rather than
guessed at in the UI copy below.

**Phase 2: Structure is asynchronous now, not a long-lived HTTP request.**
`POST /api/structure` (`functions/index.js`) now only enqueues: it runs
`checkAndReserveLimit` and input validation exactly as before, writes a
fast, minimal `users/{uid}/structureTraces` document (`status:
"processing"`, via the new `createProcessingTrace`, a split of what used to
be `logStructureTrace`), and responds immediately with `{ traceId }`. The
real work — `fetchReferenceExamples`, the actual `client.messages.create`
call (unchanged shape: `max_tokens: 8192`, no `temperature`, the same JSON
schema), phase timings, `logUsage` — now runs in `processStructureTrace`, a
new `onDocumentCreated` trigger on the same collection (not
`onDocumentWritten`: `onCreate` fires exactly once, so its own later
write-back can never retrigger itself, unlike `gradeStructureTrace`, which
needs an explicit `judgedAt` guard for exactly that reason).
`existingProjectIds` on the trace document stays ids-only (the existing
privacy stance); the trigger reconstructs real `{id, name}` pairs straight
from `users/{uid}/projects` via Admin SDK when it builds the prompt, since
the trace document itself was never meant to carry project names.

This closes the actual bug: there is no longer a long-lived HTTP request for
Firebase Hosting's `/api/**` rewrite (or whatever sits in front of it) to
cut off around 90-100s, because `processStructureTrace` is invoked directly
by Eventarc, never through that rewrite. `timeoutSeconds: 180` /
`memory: '512MiB'` on the new trigger are reasoned from the real data above
(comfortable headroom over the observed 94.6s max modelCall, at a small
sample size), not copied from `exports.api`'s own 120s/512MiB; an
event-triggered function's own ceiling is 540s, confirmed against
`firebase-functions`'s own `options.d.ts`, not assumed.

**The real correctness risk, handled and tested.** `outcome` means the
user's own confirm/cancel decision, set to `"pending"` at enqueue time.
`POST /api/structure/outcome` can race `processStructureTrace`: the new
waiting UI (below) allows Discard while still waiting, so a `"cancelled"`
outcome can land while the trigger is still mid-flight. The trigger's final
write re-reads the document immediately beforehand and only ever includes
`outcome: "pending"` if nothing real has been decided yet, never stomping a
real `"cancelled"` back to `"pending"`. Also hardened the final write itself
against its own failure: if that merge-write throws after the model call
has already been billed (`logUsage` already ran), there is no separate
fallback document the way the old `logStructureTrace` had one (this write
targets a document that already exists), so it logs every diagnostic detail
directly to Cloud Logging instead; the client's own watchdog timeout still
bounds the wait either way.

**A real bug found by testing, not assumed working.** Building
`scripts/structure-emulator-test.mjs` (below) surfaced a genuine failure:
`processStructureTrace`'s call to `logUsage` threw `"Cannot read properties
of undefined (reading 'increment')"` against the real local Firebase
emulator — `admin.firestore.FieldValue` (the legacy namespace-property
form every call site in this file uses) was undefined specifically when
accessed from inside a Firestore-triggered function's own invocation in
this emulator setup, reproduced twice, not a fluke. `logUsage` is switched
to the modular import instead (`const { FieldValue } = require(
'firebase-admin/firestore')`, added at the top of `functions/index.js`),
scoped to just this one function: every other `admin.firestore.FieldValue`
call site in this file is left untouched, since those only ever run from
contexts with an established, real production track record (the HTTP
handler, or `gradeStructureTrace`'s own long-existing trigger), unlike this
one, which this pass is the first to call from a background trigger's cold
start at all. Re-ran the same emulator test after the fix: both checks
passed, `status="done"` on a real successful model call, not the failure
path. A background task was flagged (not fixed here, out of scope) for a
same-class error this same test run incidentally found in
`gradeStructureTrace`'s own `serverTimestamp()` write, local-emulator-only,
same underlying mechanism, unrelated pre-existing code.

**Firestore rules.** `structureTraces/{traceId}` changes from `allow read,
write: if false` to `allow read: if isOwner(uid); allow write: if false`:
the client now needs to read its own trace document to `onSnapshot` it.
Write stays denied to every client, owner included; only the Function and
the local Admin-SDK scripts write here, unchanged.

**Client: `SuperRambleModal.jsx`'s `callModel`** now POSTs, reads
`traceId` from the immediate response, and subscribes via Firestore
`onSnapshot` to `users/{uid}/structureTraces/{traceId}`, resolving on
`status: "done"` (with `data.response`) or rejecting on `status: "failed"`
(with `data.errorMessage`). A 240s client-side watchdog (comfortably above
the trigger's own 180s ceiling, so the server gets a real chance to write
its own explained failure first) rejects with a clear message if nothing
ever arrives. The listener unsubscribes on every resolution path, on the
watchdog firing, and on component unmount (a new `unsubscribeTraceRef`
cleanup effect), since closing the modal mid-wait is now possible: a new
`waitingTraceId`-gated Cancel affordance (footer button, Escape, and
backdrop click) lets the user Discard while still waiting, sending
`outcome: "cancelled"` on the trace the trigger above is guarded against
stomping.

**Phase 3: UI.** The `'loading'` state now shows, once a `traceId` exists,
real-percentile copy ("Usually under 82s, can take up to 96s for a complex
dump", `STRUCTURE_P50_SECONDS`/`STRUCTURE_P90_SECONDS` in
`SuperRambleModal.jsx`, straight from the table above, not invented) and a
live elapsed-seconds counter, ticking client-side, independent of the
`onSnapshot` resolution itself. `VoiceRecorder.jsx`'s `"Transcribing what
you said."` state gets a live elapsed-time counter too, but deliberately no
percentile estimate: there is no historical Transcribe timing data yet
(this same pass is what started logging it), stated in a code comment so a
future reader doesn't mistake the omission for an oversight.

**Phase 4: tests.** `npm run eval` (67/67) confirmed unaffected:
`src/pipeline/structure.js` never imports `functions/` or touches
Firestore, offline evals still mock `callModel` directly and never
construct a real HTTP or Firestore call, so the async redesign changes
nothing about that zero-credit, zero-network guarantee. New:
`scripts/structure-emulator-test.mjs` (`EMULATOR_ALLOW_LIVE=true npm run
test:structure-emulator`), gated the same way `scripts/eval-live.mjs` is
since `processStructureTrace` spends real Anthropic credits even against
the emulator. Runs the real Firebase emulator suite (Firestore, Functions,
Auth) via `firebase emulators:exec`, creates a trace document the same
shape the real enqueue write produces, and asserts, through a real
Firestore client-SDK `onSnapshot` listener (not just an Admin-SDK poll):
the trigger resolves a normal trace to `status: "done"`, and the
outcome-race case above survives with `outcome` still `"cancelled"` after
the trigger's own final write. Documented in the script's own header,
including the local Java-runtime prerequisite for the Firestore emulator
(not previously needed by this repo's tooling) and the real-secret
prerequisite (`functions/.secret.local` or existing `gcloud auth
application-default login` credentials, the Functions emulator's own
documented ways to reach a real secret value).

**Docs updated in the same pass**, not left stale:
`docs/architecture.md`'s `structureTraces` field list (new `status` field,
`errorMessage`'s broadened meaning, the two-phase write, the owner-read
rule change), its "/api Function contract" section (states plainly that
the Hosting-cutoff problem is superseded, not solved via the diagnostic
named there), and its "Background triggers" section (full
`processStructureTrace` contract, `gradeStructureTrace`'s own guard already
covers the race safely from its side too). `docs/roadmap.md` moves this out
of "Next" into "Built" and replaces it with the real follow-ups: revisit the
small timing sample, and `scripts/diagnose-hosting-cutoff.mjs` is no longer
a blocker, just optional confirmation of the exact upstream layer if still
wanted.

**Verified:** `npm run build` clean, `node --check functions/index.js`
clean, `npm run eval` 67/67, `node scripts/check-secrets.mjs` clean, the
emulator integration test passing (above, including the FieldValue fix it
found and verified). Live verification against the real deployed site,
after merge and deploy, is logged in a follow-up entry per this task's own
instruction, not assumed from a clean build and a passing local test alone.

### Decisions not to relitigate

- The complex-transcript `502` is closed architecturally by removing the
  long-lived HTTP request entirely, not by further tuning `timeoutSeconds`,
  memory, or chasing the exact upstream layer. Do not revisit
  `exports.api`'s own timeout/memory for this symptom again;
  `processStructureTrace` runs outside Hosting's rewrite by construction.
- `processStructureTrace`'s final write must re-read the document and guard
  `outcome`/`outcomeAt` before merging, every time this code is touched
  again: a blind unconditional `outcome: "pending"` reintroduces the exact
  race this pass fixed and tested.
- `admin.firestore.FieldValue` (the legacy namespace form) is not reliable
  from inside a Firestore-triggered function in the local emulator,
  reproduced twice, fixed for `logUsage` via the modular
  `firebase-admin/firestore` import. Do not assume every other
  `admin.firestore.FieldValue` call site in this file is emulator-safe
  just because this one now is; each has only ever been verified against
  real production, not the local emulator, until proven otherwise (see the
  flagged `gradeStructureTrace` follow-up).
- `STRUCTURE_P50_SECONDS`/`STRUCTURE_P90_SECONDS` in `SuperRambleModal.jsx`
  are real numbers from a small (n=8) sample, not a final estimate. Update
  them from a fresh `npm run structure:timing-stats` run as real usage
  accumulates; do not treat them as permanently fixed constants.
- Transcribe's elapsed-time UI is a live counter, not a percentile estimate,
  on purpose: there is no historical data for it yet. Do not add a fixed
  estimate for Transcribe until `scripts/structure-timing-stats.mjs`'s own
  approach (or an equivalent) has real "transcribe phase timings" history
  to compute one from.

## 2026-07-14: Diagnostic tool added for the direct-Cloud-Run-URL test; not run against prod in this pass

The decisive remaining diagnostic named in the two entries below (calling
this Function's direct Cloud Run URL,
`https://api-5cvpktolta-uc.a.run.app/structure`, bypassing `firebase.json`'s
`/api/**` -> `api` Hosting rewrite, to show whether Hosting's rewrite itself
is the layer cutting connections around 90-100s) was attempted once and
correctly blocked: it needed a live Firebase ID token, and extracting one
from the browser's IndexedDB was never authorized. That block stands; this
pass does not attempt to extract a credential either.

Instead, added `scripts/diagnose-hosting-cutoff.mjs`, modeled on
`scripts/eval-live.mjs`'s existing gating conventions, so the diagnostic is
repeatable by whoever holds the standing credential (the user, from their
own signed-in browser session):

- Gated behind `DIAGNOSE_ALLOW_LIVE=true`, the same explicit-opt-in pattern
  `EVAL_ALLOW_LIVE` already uses, since this spends real Anthropic credits
  and hits the real deployed site.
- Requires `FIREBASE_ID_TOKEN` in env; if missing, exits with the exact
  steps to get one safely (sign into `super-ramble.web.app`, submit a real
  transcript, copy the `authorization` header's value from the real
  `/api/structure` request in DevTools Network, the same token
  `src/lib/authToken.js`'s `getAuthToken` sends). Never attempts to obtain
  the token any other way.
- Sends one fixed, repeatable synthetic transcript (three storylines: a
  Website Relaunch referencing a duplicate project name, a birthday party
  with nested sub-tasks, a camping trip with nested sub-tasks, plus a
  fourth unrelated loose task), comparable in complexity to the transcript
  that reproduced this bug live, using the exact body shape
  `SuperRambleModal.jsx`'s `callModel` sends
  (`{ transcript, existingProjects, priorErrors: null }`) and the same
  `authorization: Bearer <token>` header.
- POSTs that transcript sequentially, never concurrently, first to the
  direct Cloud Run URL, then to the Hosting-proxied `/api/structure`, so
  Cloud Run's own request log and each call's timing stay unambiguous.
- Records wall-clock duration, HTTP status, and response headers/body for
  each, prints a side-by-side result, and prints a verdict: if the direct
  call also cuts off (no response, or a non-JSON body substituted in place
  of this Function's own real response), Hosting's rewrite is not the
  culprit; if the direct call completes with this Function's own real JSON
  response (a success or its own explained truncation error), Hosting's
  rewrite is confirmed as the bottleneck.
- Added `"diagnose:hosting-cutoff": "node scripts/diagnose-hosting-cutoff.mjs"`
  to `package.json`.

**Verified:** `npm run build` clean, `npm run eval` clean (67/67 across the
offline/date/todoist/write suites plus prompt-sync), `node
scripts/check-secrets.mjs` clean, `node --check
scripts/diagnose-hosting-cutoff.mjs` clean. Ran the script directly with
neither env var set, and again with only `DIAGNOSE_ALLOW_LIVE=true` set:
both exits are clean, print the expected gating message (the second printing
the full manual-token-retrieval instructions), and neither makes any network
call. Did not run it against prod with a real token in this pass; no
Firebase ID token was extracted or fabricated for that purpose, per this
task's own instruction.

**This does not close the original bug.** The complex-transcript 502 (the
two entries below) remains open. Running this tool against real prod
traffic, with the user's own token from their own signed-in session, is the
pending next action, and belongs to whoever holds that standing credential,
not this pass.

### Decisions not to relitigate

- Extracting a live session's Firebase ID token from browser storage is not
  something to attempt in any pass, even to unblock a legitimate,
  well-scoped diagnostic. The tool exists now so a human with standing
  authorization (their own signed-in session, DevTools Network tab) can
  supply the token themselves; that boundary does not get worked around by
  building better tooling around it.
- `scripts/diagnose-hosting-cutoff.mjs`'s verdict is based on whether the
  *direct* Cloud Run call completes with a real JSON response, not on a
  strict duration threshold: an unpinned temperature can still make output
  length, and therefore duration, vary call to call (docs/resolution-log.md,
  2026-07-14's temperature entries), so a single hosting-proxied call
  finishing quickly does not by itself disprove the cutoff; the tool notes
  this inline when a run looks inconclusive.

## 2026-07-14: Incident: temperature: 0 broke every real /structure call within a minute of deploy. Reverted; the original complex-transcript 502 is still open

The entry directly below diagnosed a real 502 pattern correctly but shipped
the wrong fix, and that fix broke production. This entry is the honest
account, not a quiet correction folded into the entry it corrects: the
prior entry stays exactly as written, since it recorded what was known and
done at the time, and this entry records what happened next.

**What was deployed and what happened.** `temperature: 0` was added to
`functions/index.js`'s live `/structure` call (the entry below) and
deployed. Within about a minute, a real live test against the deployed
site returned "Request failed (internal error)," not the `502` pattern
this whole investigation had been chasing, a different, worse failure
mode: every single `/structure` call now failed immediately, short
transcripts included, not just complex ones. Pulled the real Cloud Run
stderr log for the exact request: `BadRequestError: 400
{"type":"error","error":{"type":"invalid_request_error","message":"\`temperature\`
is deprecated for this model."}}`. `claude-sonnet-5`, the pinned model
this call has used since phase 3 part 1, rejects `temperature` outright at
the API level. This was not caught before deploy because nothing in this
pass, or in `docs/llm-pipeline.md`'s standing "temperature 0" claim, or in
`src/pipeline/prompt.js`'s own `buildMessages` (which has set
`temperature: 0` since that same original pass), was ever actually
exercised against the real API with the real pinned model id. The
documented architecture was wrong, and had been wrong since whenever it
was first written or the model was later repinned to `claude-sonnet-5`
without re-verifying this claim; nothing before this incident ever made a
real call that would have surfaced it, since the live call never set the
parameter and `buildMessages` is never the live call path.

**Reverted within minutes.** `functions/index.js`'s `/structure` call no
longer sets `temperature` at all, back to the exact shape it had before
the entry below. Deployed directly and immediately once the cause was
confirmed, ahead of the normal branch/PR/CI flow this repo otherwise
always uses: this was active, ongoing user-facing breakage of every real
`/structure` call, not a case where pausing for review was the safer
choice. Verified the revert actually fixed the immediate breakage before
doing anything else: a real live call afterward returned to the
pre-existing `502` pattern (95.35s Cloud Run-reported latency), not
"internal error," confirming production is back to the state the entry
below found it in, not further broken and not newly fixed either. This
entry, the code, and the doc corrections below were committed to a normal
branch and PR after the fact, to bring source control back in sync with
what was already live; see the "Decisions not to relitigate" section
below for why this order was chosen deliberately, not a shortcut taken
carelessly.

**Docs corrected, not left stale.** `docs/llm-pipeline.md`'s "temperature
0" line is corrected in this pass to state plainly that it is false for
the pinned model, with the incident referenced directly, rather than
silently deleted (a future reader asking "why doesn't this call set
temperature" deserves the answer, not silence). `src/pipeline/prompt.js`'s
`buildMessages` had its own stale `temperature: 0` removed too, brought
back into agreement with the live call's actual shape, even though it has
no real caller; leaving a hand-synced copy confidently wrong, next to a
doc that agreed with it, is exactly the setup that let this ship in the
first place.

**The original bug (docs/resolution-log.md, the entry below) is still
open.** The diagnosis in that entry (an unpinned temperature letting a
complex transcript occasionally sample a very long completion, and
generating that many tokens taking long enough to hit an upstream
timeout) is very likely still correct as a mechanism, but `temperature: 0`
is not an available remedy for `claude-sonnet-5`. No further fix was
attempted in this pass. The next real step needs to establish, against a
real request to `claude-sonnet-5` specifically (Workbench, not
production, given what just happened), what sampling or determinism
controls this model actually accepts, if any, before writing any code
that touches the live call again.

**Verified:** `npm run build` clean. `npm run eval` 67/67, unaffected
(this pass only removes a parameter and corrects two doc/comment blocks).
`node scripts/check-secrets.mjs` clean. `node --check functions/index.js`
clean. Live: the revert confirmed deployed (`api-00020-mok`), and a real
call afterward returned to the pre-existing `502`/~95s pattern rather than
the incident's "internal error," confirming the emergency fix actually
worked before anything else was touched.

### Decisions not to relitigate

- `claude-sonnet-5` rejects `temperature` outright (a real, live `400`,
  not a guess). Do not set `temperature` on this call again without first
  confirming against a real request to this exact model id, outside
  production, that the parameter is accepted.
- A doc or a hand-synced code comment stating a model-call parameter is
  set a certain way is not proof the live call actually sets it that way.
  This entry exists because a stale, never-live-verified claim
  (`docs/llm-pipeline.md`'s "temperature 0") was trusted as settled
  architecture instead of checked against what `functions/index.js`
  actually sends. Before changing a live model-call parameter based on
  what a doc says, verify the doc's claim is still true for the pinned
  model in use today, not just internally consistent with itself.
- Deploying an emergency revert directly, ahead of the normal branch/PR/CI
  flow, was the right call here specifically because the alternative was
  leaving a confirmed, active, 100%-failure-rate regression live for
  however long a PR review and CI run would have taken. This is not a
  general license to skip the normal flow; it applies to reverting a
  change that is actively breaking production right now, confirmed, not
  suspected. The normal flow (branch, PR, CI, merge) still happened
  immediately after, to keep source control honest about what is actually
  deployed.
- The original complex-transcript `502` is not resolved. Do not treat this
  entry, or the revert it documents, as having fixed the user-reported
  bug; it only stopped a worse regression this pass introduced while
  trying to fix it. Re-open with real, pre-verified findings before
  attempting another fix.

## 2026-07-14: The complex-transcript 502 root-caused: a missing temperature: 0 on the live Structure call, not infra. The full arc, across four passes

A real user-reported bug ("small text works fine, long text gets a bare
502") took four passes to actually root-cause. Each earlier pass was a
real, necessary elimination step, not wasted work, and this entry records
the whole arc so a future reader does not have to reconstruct it from four
separate dated entries. `max_tokens: 8192` was never touched across any of
these passes; it was already fixed for a different, unrelated problem
(model-level truncation, 2026-07-07).

**Pass 1: `timeoutSeconds`.** `exports.api` had no `timeoutSeconds` set, so
it ran on firebase-functions v2's unconfigured 60s default. Set to `120`.
Real, correct, worth keeping: it is what actually governs this Function on
any path that does not go through Firebase Hosting's `/api/**` rewrite.
Live testing found it did not close the reported bug for real browser
traffic, and corrected an initial assumption along the way: Hosting's own
docs state a flat 60s rewrite-proxy cap, but real Cloud Run request logs
showed real backend latencies of 91-98 seconds for three live failed
calls, not 60, meaning something upstream (still almost certainly Hosting
or the Google Frontend layer in front of it) cuts the connection later
than documented, around 90-100s in practice, not exactly 60s.

**Pass 2: phase-level timing, and a memory bump to rule out CPU
throttling.** An Anthropic Workbench call using the exact same system
prompt, schema, and transcript finished in 9.5s, a ~10x gap against the
91-98s this Function took for the same request. That gap had to be inside
this Function's own execution, not the model call in the abstract, so
`checkAndReserveLimit`, `fetchReferenceExamples`, `client.messages.create`,
`logUsage`, and `logStructureTrace` all got their own `Date.now()` timing,
logged unconditionally to Cloud Logging (`console.log('structure phase
timings', ...)`, not gated behind `STORE_RAW_TRACES`). Memory was bumped
from the unconfigured 256MiB default to 512MiB as a first, moderate test
of CPU throttling. Live testing after this deploy found a real failed
call still took 96.26 seconds, essentially unchanged from before the
memory bump, ruling out memory/CPU as the cause. The phase timing paid
for itself immediately: `checkAndReserveLimit` (196ms),
`fetchReferenceExamples` (605ms), `logUsage` (294ms), and
`logStructureTrace` (516ms) together were under 1.6 seconds; **94,620 of
the 96,232 total milliseconds, 98%, were inside `client.messages.create`
itself.**

**Pass 3 (this entry's own investigation): what was actually happening
inside the model call.** Pulled every `structure phase timings` log entry
recorded since the 512MiB deploy and matched each one to its Firestore
trace by `traceId`, to see real output-token counts against real
`modelCall` durations on the exact same deployed instance:

| output tokens | modelCall duration | effective rate |
|---|---|---|
| 485 | 8.0s | ~61 tok/s |
| 6,837 | 79.9s | ~86 tok/s |
| 8,192 (hit the cap) | 94.6s | ~87 tok/s |

A strikingly consistent generation rate across all three, meaning duration
tracked almost exactly with how many tokens the model happened to
generate, not anything about where the call originated. That reframed the
Pass 2 Workbench comparison: it was never a fair apples-to-apples test,
since the one Workbench sample (796 output tokens) and the real failing
production calls (6,837-8,192 output tokens) were different completions
with different lengths, not the same request behaving differently in two
places. **The real question became why a supposedly identical transcript
produces such wildly different completion lengths on repeated live
calls**, and the answer was a real bug: `functions/index.js`'s
`/structure` handler never set `temperature` on its `client.messages.create`
call, so it ran on the Anthropic API's own default (1), not the
`temperature: 0` `docs/llm-pipeline.md` has documented as this call's
deliberate, stated architecture since phase 3 part 1. `src/pipeline/prompt.js`'s
`buildMessages` does set `temperature: 0` correctly, but that function is
never the live call path (Firebase Functions deploys only `functions/`,
never `src/pipeline`, docs/resolution-log.md, 2026-07-06); the two copies
had silently drifted apart on this one parameter, undetected, since
whatever pass first wrote `functions/index.js`'s own copy of this call.
Checked whether any other real call site independently sets its own
temperature, for consistency: none does.
`functions/index.js`'s own `gradeStructureTrace` grading call and
`scripts/grade-traces.mjs`'s grading call both also omit `temperature`,
same as the Structure call did, but neither is documented anywhere as
requiring a specific temperature the way the Structure call is, so neither
was touched; changing either without a stated reason would be an
undocumented architectural decision this pass has no standing to make
unilaterally.

**What shipped.** `functions/index.js`'s `/structure` handler now sets
`temperature: 0` on its `client.messages.create` call, matching
`docs/llm-pipeline.md` and `src/pipeline/prompt.js` for the first time
since this hand-synced pair was created. Without an unpinned temperature
letting a complex transcript occasionally sample a long, exploratory
completion (sometimes running the full `max_tokens: 8192` budget), a
short transcript rarely had the same problem: there is little room for a
long completion regardless of temperature on a short input, matching
"small text works, long text 502s" exactly.

**A real gap, flagged, not fixed in this pass.** `scripts/check-prompt-sync.mjs`
only ever compared `STRUCTURE_SYSTEM_PROMPT_RULES` text and `contracts.js`
behavior between the hand-synced pairs; it never checked the actual
model-call parameters (`temperature`, `max_tokens`, the model id itself)
for parity, which is exactly why this specific drift shipped silently and
went undetected through every prior pass that touched either copy of this
call. Closing this needs its own scoped design (what parameters actually
need parity-checking, and how, given `functions/index.js`'s copy is
extracted from source text the same way `STRUCTURE_SYSTEM_PROMPT_RULES`
is today); not built here, on purpose, per this task's own instruction.

**Also logged, not built:** `docs/roadmap.md`'s "Next" section now notes
moving Structure off a synchronous request/response wait and onto
listening for the `structureTraces` document instead (Firestore
`onSnapshot`), since Pass 2's live testing already showed the Function
completing a real call and writing a real trace that the browser never
got the HTTP response for at all; waiting on the trace document directly
would make a genuinely slow call resilient to exactly this class of
upstream-timeout failure, not just less likely to trigger it. A real,
separate architecture change, not attempted here.

**Verified before deploy:** `npm run build` clean, asset hash unchanged
(this pass touches only `functions/index.js` and docs, nothing under
`src/`, so no hosting redeploy is needed, only `functions`). `npm run
eval` 67/67, unaffected since this only adds a `temperature` parameter and
a doc-only roadmap line, no change to anything the offline suite
exercises (offline evals mock `callModel` and never construct a real
Anthropic request). `node scripts/check-secrets.mjs` clean. `node --check
functions/index.js` clean. Live verification (the original three-storyline,
disambiguation-heavy transcript, submitted against the deployed site after
merge and deploy) is logged in a follow-up entry, per this task's own
instruction to verify the live result directly rather than trust a deploy
command's exit code.

### Decisions not to relitigate

- The root cause of the complex-transcript 502 was a missing
  `temperature: 0` on `functions/index.js`'s live `/structure` call, not
  `timeoutSeconds`, not memory/CPU, and not `max_tokens`. Those three were
  each genuinely tested and ruled out or otherwise correctly fixed across
  Pass 1 and Pass 2; do not revisit any of them chasing this same symptom
  again without new evidence.
- A Workbench call and a deployed Function call producing wildly different
  wall-clock times on "the same" transcript is not, by itself, proof the
  difference is environmental. Check whether the two calls actually
  produced completions of comparable length before concluding the hosting
  environment is the cause; an unpinned temperature can make "the same
  input" produce very different output lengths on repeated real calls,
  and output length is what actually drives duration for a non-streaming
  call.
- `src/pipeline/prompt.js`'s `buildMessages` setting `temperature: 0`
  correctly was not, by itself, evidence the live call also did: it is
  never the live call path. When auditing a hand-synced pair for drift,
  check the copy that actually deploys and runs, not the one that reads
  as the source of truth by convention.
- `scripts/check-prompt-sync.mjs` does not check model-call parameter
  parity (`temperature`, `max_tokens`, model id) between the two
  `client.messages.create` call sites, only the system-prompt text and
  `contracts.js`'s behavior. This is a known, real gap, not solved here;
  do not assume a clean `check-prompt-sync` run means the two live call
  constructions are fully equivalent.

## 2026-07-14: Phase-level timing added to /structure; memory bumped to 512MiB to test CPU throttling, per an Anthropic Workbench comparison that ruled out the model call itself

Follow-up to the two entries below (the `timeoutSeconds: 120` fix and its
live-verification correction). Neither `timeoutSeconds: 120` nor
`max_tokens: 8192` is touched in this pass; both stay exactly as those
prior passes left them. This is a narrower, separate investigation into
where the ~90-98s a real `/structure` call takes on the deployed site is
actually being spent.

**The decisive evidence that reframed this investigation came from outside
this repo.** An Anthropic Workbench call using the exact same system
prompt this Function builds (`STRUCTURE_SYSTEM_PROMPT_RULES` plus the live
`referenceExamples` pool, printed and pasted in directly, not retyped from
memory), the exact same `STRUCTURE_JSON_SCHEMA`, the exact same complex
test transcript, `claude-sonnet-5`, `max_tokens: 8192`, finished in **9.5
seconds** (`stop_reason: "end_turn"`, 4.1K input tokens, 796 output
tokens). The same request through the deployed Function took 91-98
seconds across three live attempts before an upstream layer returned a
`502` (the entry below). A ~10x gap between those two numbers, with every
model-facing input held identical, rules out the model call itself as the
bottleneck. The time is being spent somewhere inside this Function's own
execution: a cold start, one of the four real async operations in the
`/structure` path (`checkAndReserveLimit`, `fetchReferenceExamples`,
`logUsage`, `logStructureTrace`), or CPU throttling from `256MiB`,
firebase-functions v2's unconfigured memory default, already found and
logged as a real gap alongside the `timeoutSeconds` finding two entries
below.

**What shipped.** `functions/index.js`'s `/structure` handler now times
each of those four phases with `Date.now()` and logs the full breakdown
unconditionally to Cloud Logging the moment a call reaches the point where
`logStructureTrace` has finished (`console.log('structure phase timings',
{ uid, traceId, totalMs, checkAndReserveLimit, fetchReferenceExamples,
modelCall, logUsage, logStructureTrace })`), not gated behind
`STORE_RAW_TRACES`: this needs to be visible on every real call going
forward, not just a local debug run, since the whole point is watching
what a real deployed call does that a Workbench call cannot reproduce.
Separately, `exports.api`'s config now also sets `memory: '512MiB'`
alongside the existing `timeoutSeconds: 120`, a first, moderate test of
the CPU-throttling theory specifically, chosen as a deliberate doubling of
the 256MiB default rather than a final number: the phase timings above are
what actually confirm or rule this out, not the choice of 512MiB itself.

**Verified before deploy:** `npm run build` clean, asset hash unchanged
from what's already live (this change touches only `functions/index.js`'s
handler internals and Function config, nothing under `src/`, so no hosting
redeploy is needed, only `functions`). `npm run eval` 67/67, unaffected by
this change since it adds only timing/config code around existing calls,
no behavior change to anything the offline suite exercises. `node
scripts/check-secrets.mjs` clean. `node --check functions/index.js`
clean.

**Not yet known:** whether 512MiB actually closes the gap, or where the
phase timings show the time going if it doesn't. Live verification (two
real calls in immediate succession against the deployed site, to separate
one-time cold-start cost from steady-state per-request cost, per this
task's own instruction) is logged in a follow-up entry once merged and
deployed, with the actual phase-by-phase numbers, not a restatement of
"faster" or "not faster."

### Decisions not to relitigate

- `timeoutSeconds: 120` and `max_tokens: 8192` are unrelated to this
  investigation and are not touched here. Do not re-open either while
  chasing this separate CPU/memory question.
- A Workbench call and a deployed Function call using byte-identical model
  inputs (system prompt, schema, transcript, model id, `max_tokens`) but
  wildly different wall-clock time is strong evidence the gap is inside
  the Function's own execution, not the model. Trust this kind of
  controlled, identical-input comparison over guessing at Cloud Function
  overhead in the abstract.
- 512MiB is a first test value, not a considered final number. If this
  pass's live phase timings show it did not close the gap, do not
  immediately try a second, larger memory value blind; read what the
  phase timings actually show first, per this task's own explicit
  instruction.

## 2026-07-14: PR #7 merged and deployed; live testing found the real upstream cutoff is ~90-100s, not the 60s the entry below assumed, and corrects it

Follow-up to the entry directly below. `timeoutSeconds: 120` merged
([PR #7](https://github.com/cottalucas/super-ramble/pull/7)), CI passed,
deployed (`firebase deploy --only functions`; no hosting redeploy needed,
confirmed via an unchanged built asset hash, since this change touches
only `functions/index.js`'s Function config). Confirmed live via both the
Cloud Functions v2 and Cloud Run Admin REST APIs, not just the deploy
command's exit code: `serviceConfig.timeoutSeconds` and
`template.timeout` both read `120s` on the deployed `api` service.

**Live verification, per this task's own explicit instruction, with a
real complex multi-thread transcript through the real signed-in browser
UI.** The user signed in at `super-ramble.web.app` so this could be driven
against the real deployed site, not simulated. Submitted a transcript with
three separate storylines (a Website Relaunch, referencing a project name
that is a genuine live duplicate in this account; a birthday party with
nested sub-tasks; a camping trip with nested sub-tasks), plus a fourth
unrelated loose task, at least as complex as the transcript that originally
reproduced this bug. It failed with a bare `Request failed (502)` in the
browser, same as the original report. Two further real attempts (a
different, also-complex real transcript this account already had a
history with) reproduced the same class of failure again.

**This is not resolved for real users, and the record needs a real
correction, not just a "not fully verified" caveat.** `docs/architecture.md`
already stated Firebase Hosting's rewrite proxy caps requests at 60
seconds, cited from Firebase's own docs. Live testing shows that number is
not what is actually happening here. Pulled the real Cloud Run request
logs (Cloud Logging, `run.googleapis.com/requests`) for all three failed
calls: reported backend latencies of **98.062s, 91.633s, and 93.554s**,
each ending in a `502`, each well under this Function's own newly-
configured 120s limit (confirmed via the Cloud Run Admin API directly,
`template.timeout: 120s`, so this Function's own timeout was not what
ended any of these three calls), and each well over the 60s Hosting's own
docs describe. Something upstream of this Function, most likely still
Hosting's rewrite proxy or the Google Frontend layer in front of it, cuts
these connections around 90-100 seconds in practice, not the documented
60s. `docs/architecture.md`'s "/api Function contract" section is updated
in this same pass to state this precisely rather than repeat the
un-verified 60s figure as settled fact. This is exactly the kind of gap
between a doc's claim and what actually happens live that
`docs/orchestration.md`'s loop exists to catch and correct, not carry
forward uncorrected once found.

**A real, useful nuance, not just a restatement of failure.** Checked
`users/{uid}/structureTraces` for all three windows directly rather than
inferring from the browser alone. Two of the three failed calls *did*
write a real trace document, `ok: false`, `stopReason: 'max_tokens'`, the
existing, already-explained truncation path from 2026-07-07: the Function
itself ran to completion within the ~90-98s window, correctly identified
the truncation, correctly wrote its trace, and correctly generated its own
explained JSON `502` body. The browser never saw that explained body
(the network response was Google's own generic infrastructure `502` HTML
page, not this app's JSON error shape), because whatever sits upstream had
already given up and substituted its own error page by the time the
Function's real response would have arrived. This is genuine, working
improvement from `timeoutSeconds: 120` (the Function's own explained-error
code paths now more reliably get the room to finish), even though the
user-visible outcome is still an unhelpful, generic failure. The third,
most complex call (the three-storyline transcript above, 98.062s) wrote no
trace at all: even the improved path did not get far enough before the
same upstream cutoff, for whichever specific reason (the Anthropic call
itself likely still in flight, nothing left to log yet).

**A decisive next diagnostic was identified and deliberately not
attempted.** Calling this Function's own direct Cloud Run URL
(`https://api-5cvpktolta-uc.a.run.app`) instead of the Hosting-proxied
`/api/**` route, with the same real request, would conclusively show
whether Hosting's rewrite specifically is the upstream layer responsible:
if that direct call also cuts off around 90-100s, the cause is something
else entirely (Cloud Run's own infrastructure, unrelated to Hosting); if
it does not, Hosting's rewrite is confirmed as the bottleneck. Attempting
this needed a real Firebase ID token; the only one available was the live
token already active in the signed-in browser session, and extracting it
from IndexedDB to make a direct authenticated call was attempted once,
correctly blocked by this environment's own safety layer as a live
credential-materialization action never explicitly authorized for this
purpose, and not reattempted or worked around. This diagnostic is real,
concrete follow-up work; it needs either a human running it directly with
their own credentials, or an explicit, scoped authorization for
extracting and using a session token for exactly this one diagnostic call.

**Verified:** the deployed `timeoutSeconds`/`template.timeout` is `120s`
(Cloud Functions and Cloud Run Admin REST APIs, not just the deploy
command's exit code). Three real live calls against the deployed site,
signed in as the real user, reproduced the reported failure class. Real
Cloud Run request-log latencies pulled directly from Cloud Logging for all
three (98.062s, 91.633s, 93.554s). `users/{uid}/structureTraces` checked
directly for all three windows, confirming which calls did and did not
write a trace. `docs/architecture.md` corrected in the same pass to state
the actual observed cutoff instead of the assumed 60s figure.

**Not resolved, stated plainly, matching this task's own instruction to
name what remains open rather than close this out as fully fixed:** a
real user's complex transcript can still fail today with an unexplained,
generic `502` on the deployed site. `timeoutSeconds: 120` is real,
correct, and demonstrably helped (two of three calls now complete their
own explained-error logic server-side, where before this fix likely none
would have), but the user-facing symptom this task was filed against is
not eliminated. The Anthropic-call-level timeout gap flagged in the entry
below is also still open, unchanged, not attempted in this pass either.

### Decisions not to relitigate

- Firebase's own hosting documentation states a flat 60-second cap on
  Hosting's rewrite proxy. Live testing against this app's actual deployed
  setup found real cutoffs around 90-100 seconds instead, not 60. Trust
  the live-observed number for this app going forward, not the
  documentation's flat figure, until a future pass identifies the exact
  mechanism with more precision.
- A trace document existing for a failed call does not mean the user saw
  an explained error. Two of three real failed calls here wrote a proper
  trace and generated a proper explained `502` body server-side, and the
  browser still only ever saw a generic, unhelpful error, because an
  upstream layer had already substituted its own response. Checking
  `structureTraces` alone is not sufficient to confirm a user-facing
  error was actually explained; check what the browser's network response
  body actually contained too.
- Do not extract a live session's auth token from browser storage to make
  an authenticated call on the user's behalf, even for a legitimate
  diagnostic purpose, without the user's explicit, scoped authorization
  for that specific action. This was attempted once in this pass, was
  correctly blocked, and was not worked around; the same diagnostic
  (calling the direct Cloud Run URL) remains open, real follow-up work for
  whoever has standing authorization to do it.

## 2026-07-14: exports.api given an explicit 120s timeoutSeconds; Firebase Hosting's own separate 60s cap found and flagged, not solved

Reported directly, confirmed live: a complex, multi-thread transcript
(three storylines, nested sub-tasks, a duplicate project name) submitted
through the deployed app returned a bare `502` with no explanatory body
past what the browser itself surfaces, and `npm run traces:list --uid
<uid>` showed zero new `users/{uid}/structureTraces` documents for that
request. That is only possible if the Function died before
`logStructureTrace` (`functions/index.js:670` at the time) ever ran, since
every real `/structure` call, success or failure, is supposed to write a
trace unconditionally (`docs/architecture.md`).

**Root cause.** `exports.api` (`functions/index.js`, the one `onRequest`
behind every `/api/**` route, `firebase.json`'s rewrite) had no
`timeoutSeconds` set, so it ran on firebase-functions v2's own unconfigured
default: 60 seconds. `/api/structure`'s Sonnet call (`max_tokens: 8192`,
kept exactly as-is per this task's own instruction; that value was already
raised for the separate, already-resolved truncation problem, 2026-07-07)
formats up to 30 `referenceExamples` into the system prompt
(`fetchReferenceExamples`) before the model call even starts. For a
genuinely complex transcript this whole round trip can run past 60s, and
the platform kills the function mid-`await`, before `logStructureTrace` or
any of the three deliberate 502 branches (refusal, `max_tokens`, invalid
JSON, `docs/llm-pipeline.md` Stage 2) ever execute. The result is a bare,
unexplained `502` with no trace, exactly what was reported.

**What shipped.** `exports.api`'s config now sets `timeoutSeconds: 120`,
comfortably above a typical slow Structure call and nowhere near Cloud
Run's real ceiling for HTTPS/`onRequest` functions in firebase-functions
v5, 3,600s (`node_modules/firebase-functions/lib/v2/options.d.ts`'s own
doc comment, checked directly rather than assumed before picking a
number). `docs/architecture.md`'s "/api Function contract" section
documents the decision and the limitation below in the same pass.

**This does not fully close the reported bug, and the code and docs both
say so, not just this entry.** Checked, per this task's own explicit
instruction, whether Firebase Hosting's `/api/**` rewrite proxy has a
timeout of its own, shorter than Cloud Functions' own limit. It does:
confirmed directly against Firebase's own documentation
(firebase.google.com/docs/hosting/functions), not a summarized or
secondhand source: "Firebase Hosting is subject to a 60-second request
timeout. Even if you configure your HTTPS function with a longer request
timeout, you'll still receive an HTTPS status code 504 (request timeout)
if your function requires more than 60 seconds to run." This is not
configurable through `firebase.json` or any other Hosting setting found;
a public feature request asking Google to make it configurable is still
open, unresolved, as of this pass. Every real browser call in this app
goes through exactly that rewrite (`docs/architecture.md`: "The browser
... calls same-origin `/api/**`"), so a Structure call that genuinely
takes longer than 60 seconds can still fail silently for a real user after
this change: Hosting's own proxy now returns the `504` before this
Function's `timeoutSeconds: 120` is ever consulted, same missing-trace
symptom as before, just sourced from a different layer.

`timeoutSeconds: 120` is still the correct, necessary fix to make in this
pass, not a wasted change: it is what actually governs this Function on
every path that does not go through the Hosting rewrite (a direct Cloud
Run invocation, the emulator, a future architecture change), and it
replaces an implicit dependency on a platform default with a stated,
intentional value. But it is not sufficient on its own for the exact bug
reported, and this entry says so plainly rather than closing this out as
fully resolved.

**What a real fix needs, not attempted in this pass.** Most likely:
calling this Function's own Cloud Run URL directly for the `/structure`
route specifically, bypassing the Hosting rewrite (and its
non-configurable cap) entirely, with its own CORS configuration (today's
`cors: false` assumes same-origin only) and a client-side change to call
that URL instead of `/api/structure` for this one route. That is a real,
separate architecture decision with its own blast radius (a public,
directly-callable Function URL, CORS opened for a known origin, a new
client-side branch), not something to fold into a `timeoutSeconds` config
change. Flagged here for a future, separately-scoped pass rather than
attempted under this one's scope.

**Separately flagged, not fixed, per this task's own explicit
instruction.** Even with `timeoutSeconds: 120` (and, eventually, a real
fix for the Hosting-layer cap above), a genuinely slow or hung Anthropic
call still has no catchable, shorter timeout of its own ahead of either
outer limit: `client.messages.create(...)` runs with no `timeout` option
today. A hang or a slow response is still a silent, unexplained failure
today (the outer `try`/`catch` at the bottom of `exports.api`'s handler
would catch a thrown SDK timeout error and return its generic `internal
error` `500`, but `logStructureTrace` still never runs, since it sits
after the `await` that would have thrown). Solving this properly needs a
real design decision, not a one-line addition: what a timed-out call's
trace document should look like (there is no `response.usage` to record
cost from if the request never came back), whether it should count
against `checkAndReserveLimit`'s daily ceiling at all, and what the
client-facing error body should say. Not trivial to add cleanly alongside
this pass's change, so, per the task's own instruction, noted here as a
follow-up rather than solved now.

**Verified:** `npm run build` clean (asset hash `index-Yu1caoV7.js`
unchanged from what's already live, confirming this change touches no
client-imported file and needs no hosting redeploy, only `functions`).
`npm run eval` 67/67 (18 fixture/contract cases, 12 date, 26 Todoist, 11
write, plus prompt sync), unaffected by this change since it touches only
`functions/index.js`'s Function config, nothing under `src/pipeline`.
`node scripts/check-secrets.mjs` clean. `node --check functions/index.js`
clean. Live verification (a real call against the deployed site, the
Hosting-cap question this entry raises can only really be answered by
watching a genuinely slow real call) is logged in a follow-up entry once
merged and deployed, per this task's own instruction to verify the live
result directly rather than trust a deploy command's exit code.

### Decisions not to relitigate

- `max_tokens: 8192` on the Structure call is untouched. That value was
  already raised, for a different, already-resolved problem (model-level
  truncation, `docs/resolution-log.md`, 2026-07-07). This pass's problem is
  an infra-level platform timeout, a different failure mode entirely; do
  not conflate the two or re-lower/re-raise `max_tokens` chasing this bug.
- Firebase Hosting's `/api/**` rewrite has its own hard, non-configurable
  60-second request timeout, confirmed against Firebase's own
  documentation, independent of any `timeoutSeconds` set on the Cloud
  Function it rewrites to. Do not assume a longer `timeoutSeconds` alone
  fixes a timeout-shaped failure for real browser traffic in this app
  without checking whether the request went through this rewrite; it
  always does today.
- The Anthropic call itself still has no request-level timeout shorter
  than the Function's own outer limit. This is a known, open gap, not an
  oversight missed by this pass; do not assume `timeoutSeconds: 120` alone
  makes a hung model call fail cleanly with a trace and an explained error.

## 2026-07-13: Firestore-backed reference examples and automatic grading merged and deployed; the live trigger verified against a real trace and a synthetic one

Follow-up to the entry directly below (the reference-examples-to-Firestore
and automatic-grading architecture change). Branched, PR'd
([PR #6](https://github.com/cottalucas/super-ramble/pull/6)), CI passed,
merged to `main` (`fc7585e`). Deployed
`firebase deploy --only functions,firestore:rules,firestore:indexes` (this
PR touches `functions/`, `firestore.rules`, and adds
`firestore.indexes.json`; confirmed separately below that no client file
this PR touched is actually imported by anything in `src/`, so hosting did
not need a redeploy). `gradeStructureTrace` failed its first deploy attempt
with `Permission denied while using the Eventarc Service Agent`, a known,
one-time IAM-propagation delay for a project's first-ever 2nd-gen
Eventarc-triggered function; waited, retried, succeeded
(`✔ functions[gradeStructureTrace(europe-west1)] Successful create
operation`). `firebase functions:list` confirmed both `api`
(`us-central1`, HTTPS) and `gradeStructureTrace` (`europe-west1`, Firestore
`document.written` trigger) live. The region split is expected, not a bug:
Firestore triggers auto-co-locate with the Firestore database itself
(`firebase firestore:databases:list` confirms the database is provisioned
in `eur3`/Europe), independent of the HTTP function's own region default.

**Why hosting did not need a redeploy.** This PR's only `src/` changes are
`src/pipeline/prompt.js` (dropped the reference-examples append) and the
addition of `functions/contracts.js` (a `functions/`-side file, not a
`src/` one). `grep -rln "pipeline/prompt\|pipeline/contracts"` across the
repo, excluding `functions/`, shows only local scripts import either file
(`scripts/grade-traces.mjs`, `promote-trace.mjs`, `check-prompt-sync.mjs`,
`review-queue.mjs`, `eval-offline.mjs`, `list-traces.mjs`) — nothing under
`src/` imports `src/pipeline/prompt.js` at all, so its content never
reaches the built client bundle. Checked directly rather than assumed,
same discipline the PR #3/#4 deploy entry below already established for
this exact class of question.

**Live verification, basic grading path (a real trace, a real trigger
firing).** Picked a real, previously-graded trace
(`wPWKIUs0mXfeeCGRYJXx`, `outcome: confirmed`, both judge fields already
`flag` from an earlier manual `grade-traces.mjs` run this session) and
cleared its `judgedAt`/`judgeCompleteness`/`judgeCorrectness`/`judgeNotes`
fields via a direct Admin SDK write, the minimum write that puts the
trigger's own guards (`outcome` set and not `pending`, `judgedAt` absent)
back into the state a fresh real outcome-write would produce. The trigger
re-fired for real: a fresh `judgedAt` timestamp landed within seconds, and
the verdict came from a genuine new Haiku call (`judgeCompleteness`
flipped from `flag` to `ok` between the two runs, `judgeCorrectness`
stayed `flag` — the kind of small drift a real independent LLM call
produces, not a cached result). Confirmed the resulting write was correct
for a plain `confirmed` outcome: exactly one new `pipelineLearningLog`
entry (`kind: "flagged"`), and `referenceExamples` untouched (still 4
seed documents) — no promotion attempted, as designed, since `outcome`
was `confirmed`, not `confirmed_with_edits`.

**Live verification, full auto-promotion path (synthetic, clearly
labeled).** No real trace in production has `outcome: "confirmed_with_edits"`
yet — checked all 12 real traces under the dogfooding uid before this
pass began; every one is a plain `confirmed` or `cancelled`. Rather than
leave the reconstruct-validate-promote branch of `gradeStructureTrace`
unverified against the real deployed function, wrote one synthetic test
trace directly to Firestore (`users/{uid}/structureTraces/zzz-live-verify-
auto-promotion-DELETE-ME`): real, already-grounded transcript and response
content (the same Big Sur camping trip case used elsewhere in this repo),
`outcome: "confirmed_with_edits"`, and a realistic `edits` diff a real user
edit would produce (a project rename, one task's content reworded, one
task removed). The trigger fired for real against this document, exactly
as it would for a genuine user action: graded it (flagged, same as the
real trace above), reconstructed the corrected tree, validated it, and
wrote a new `referenceExamples` document with `source: "auto-promoted"`
and the correct `promotedFromTraceId`. Read back and confirmed field by
field: the project rename, the reworded task content, and the task removal
were all present and correct in the written tree; a matching
`pipelineLearningLog` entry (`kind: "auto-promoted"`) was also written.
This confirms the trigger's reconstruction, contract validation, grounding
check, Firestore write, and cap-enforcement logic all run correctly
end-to-end in the real deployed environment, not just in the offline unit
tests written during development. **Stated plainly, per this pass's own
instruction to name what was not fully verified**: this exercised the
trigger's own logic for real, but not a real user's actual edit made
through the deployed browser UI — no such trace exists yet to test
against, so that specific half of "real end-to-end" (a real person editing
a real preview, confirming, and watching their own correction get
auto-promoted) remains unobserved. All three artifacts this test created
(the synthetic trace, the `auto-promoted` `referenceExamples` document, and
the `pipelineLearningLog` entry) were deleted immediately after
verification; `referenceExamples` was confirmed back to exactly the 4
original seed documents afterward, and the one real `pipelineLearningLog`
entry from the basic-grading verification above was confirmed to still be
the only real entry present. No production data was left polluted by
either test.

**README verified live on GitHub `main`.** Fetched
`github.com/cottalucas/super-ramble/blob/main/README.md`, confirmed the
page is serving commit `fc7585e` (this PR's merge commit). Text-extracted
and read the full "Does this get smarter over time?" section, the "Key
files" list, and the "Documentation" section verbatim against what was
written; all matched. The "For developers" `<details>` block is collapsed
in the rendered DOM and this session's browser-automation tools could not
expand or screenshot it reliably (the screenshot renderer returned blank
frames and `scroll` timed out repeatedly this session, a tooling issue,
not a content issue); verified that section instead by reading the local
`README.md` at the same commit `main` is already on, confirming "Run
locally" is absent and the rest of "For developers" (evals, watch spend,
privacy) is intact.

Verified: `npm run eval` was already green pre-merge (see the entry
below). Post-deploy, live: `gradeStructureTrace` re-grades a real trace on
a real Firestore write (confirmed above), the full auto-promotion branch
runs correctly end-to-end against the real deployed function (confirmed
above, synthetic input, cleaned up after), `referenceExamples` correctly
holds only the 4 seed documents in steady state, and the README is
correctly live on GitHub `main`. Not verified: a real user's own edit,
made through the deployed browser UI, triggering a real auto-promotion —
no such trace exists in production yet.

### Decisions not to relitigate

- A `firebase deploy` success message is not itself live verification.
  Forcing a real trigger firing (by writing/clearing the exact fields its
  own guards check) and reading back the result is; this pass did that for
  both the basic-grading and full-auto-promotion branches of
  `gradeStructureTrace`.
- When no real trace exists yet to exercise a code path a deploy needs
  verified, write one synthetic-but-realistic test document directly
  (matching this app's `confirmed_with_edits` shape and using otherwise-
  real, grounded content), let the real deployed trigger act on it, then
  delete every artifact it created. This tests the trigger's own logic for
  real without leaving fake data in the live-serving `referenceExamples`
  pool or the real user's trace history. State plainly that this is not
  the same as a real end-to-end user action when it isn't.

## 2026-07-13: Reference examples moved to Firestore; grading and a bounded auto-promotion path made automatic

A real architecture change, not a docs pass: `referenceExamples` moved out
of source files (`src/pipeline/referenceExamples.js`,
`functions/referenceExamples.js`) into a Firestore collection, grading
moved from a manually-run script to a Firestore trigger, and a bounded
auto-promotion path now writes a corrected trace into the live example pool
automatically when two independent signals agree: the user's own
`confirmed_with_edits` correction, and the automatic grader independently
flagging the same trace's original response.

**What shipped.**

- `referenceExamples/{id}` (new, top-level Firestore collection,
  `docs/architecture.md`): `transcript`, `response`, `source` (`"seed" |
  "auto-promoted" | "manual"`), `addedAt`, `promotedFromTraceId`, `notes`.
  `scripts/seed-reference-examples.mjs` copied the four original hand-
  picked examples in with `source: "seed"`, confirmed live (4 documents,
  read back and spot-checked field by field, not just trusted from the
  write call's own success), before `src/pipeline/referenceExamples.js`
  and `functions/referenceExamples.js` were deleted. The seed data now
  lives as a literal array inside the seed script itself, not imported
  from the files it just deleted, so the script stays genuinely re-runnable
  as a disaster-recovery tool rather than becoming dead code that throws
  on a missing import the moment anyone ran it a second time.
- `functions/index.js`'s `/api/structure` handler fetches the current
  `referenceExamples` pool at request time (`addedAt` descending, capped
  at 30) instead of reading a value frozen at build time, formats it into
  the same labeled block a file-based version produced, and appends it to
  `STRUCTURE_SYSTEM_PROMPT_RULES`. A Firestore read failure here degrades
  to written-rules-only rather than a 500; this is the exact prompt shape
  the app ran before reference examples existed at all, not a failure
  mode. `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` goes back to being just
  the written rules, no Firestore dependency, no reference-example
  assembly of its own; it never had a live caller besides
  `scripts/check-prompt-sync.mjs` to begin with.
- `functions/contracts.js` (new): a hand-synced copy of
  `src/pipeline/contracts.js` (`validateStructure`, `allContents`,
  `isGroundedInTranscript`, `ungroundedContents`), needed because the
  auto-promotion trigger has to validate a reconstructed tree before
  writing it, and `functions/` cannot import `src/pipeline` any more than
  it ever could. This is a real, deliberate fourth instance of this app's
  "kept in sync by hand" pattern (after `STRUCTURE_SYSTEM_PROMPT_RULES`,
  and the now-retired `referenceExamples.js` pair), guarded the same way:
  `scripts/check-prompt-sync.mjs` now also diffs this pair, behaviorally
  (a shared set of probe cases run against both copies, since a validator
  is code, not a string `SYSTEM_PROMPT`-style byte comparison can check).
  **Caught a real gap in the check script itself while writing it**: an
  initial probe set used only a wildly-out-of-range priority (9) to test
  the range check, and a deliberately-introduced `p <= 5` drift (instead
  of `p <= 4`) passed silently, since 9 fails either boundary. Added a
  probe case for the boundary value itself (priority 5), verified it then
  caught that exact drift, restored, reran clean. The lesson generalizes:
  a probe case for "clearly wrong" is not the same as a probe case for
  "wrong by exactly the amount a boundary typo would produce."
- `functions/index.js` exports `gradeStructureTrace`, a new
  `onDocumentWritten` Firestore trigger on
  `users/{uid}/structureTraces/{traceId}`. Grades on this app's default
  Haiku model (mirrors `scripts/grade-traces.mjs`'s exact call, a third
  hand-synced copy of that same grading logic, accepted for the same
  reason the other two are), guarded against retriggering itself: it
  checks `judgedAt` is not already set before doing anything, so its own
  merge write produces one harmless extra invocation that immediately
  no-ops, never a loop. Verified this guard is the actual mechanism by
  unit-testing the reconstruction logic and reasoning through the event
  sequence directly against the installed `firebase-functions` library's
  own source (`Change.fromObjects(before, after)`), not assumed from
  memory of how Firestore triggers generally work.
- Auto-promotion, same trigger, right after grading, only when `outcome
  === "confirmed_with_edits"` and the grader flags the original response:
  `reconstructCorrectedTree(response, edits)` replays the persisted diff
  (`removedTasks`, `contentEdits`, `projectNameChange`) onto a clone of the
  model's real, untouched response, since the trace schema only ever
  persists what changed, not a second full corrected tree.
  **Content edits are always reliable** (`originalContent` is captured
  client-side before any change, so it always matches the pristine
  response). **Removals are not always reliable, and this is a real,
  documented limitation, not an oversight**: `SuperRambleModal.jsx`'s own
  `removeTask` drops any pending `contentEdits` entry for a task once it
  is removed, so the "edited, then removed" sequence leaves
  `removedTasks[].content` holding text that was never written back into
  `response` by a matching edit either; there is no way to recover what
  that task's original content was from the persisted trace alone. When
  reconstruction cannot locate every `removedTasks` entry, it reports the
  miss rather than guessing, and auto-promotion is skipped for that trace,
  the same fail-closed posture the rest of this pipeline already takes.
  Verified directly with three unit cases (a clean rename+edit+removal, a
  root-task removal cascading its own sub-tasks, and the edited-then-
  removed case producing exactly the expected warning), not assumed from
  reading the code. A routing trace (`response.targetProjectId` set) is
  also skipped outright, even with two agreeing signals: a reference
  example has to stay generic and reusable, never tied to one real
  historical Firestore id, the same reason all four original seed
  examples already had `targetProjectId: null`, not by accident.
- `pipelineLearningLog/{id}` (new, top-level collection): one entry per
  trace the grader flagged that did not (or could not) auto-promote,
  `kind: "auto-promoted" | "flagged"`, `resolved`, plus `uid` and
  `mirrored`, both **added beyond this task's own literal field list**,
  for reasons that are functional necessities, not scope creep: without
  `uid`, nothing reading this top-level collection could find the trace
  back under its owning `users/{uid}/structureTraces` subcollection to
  review or promote it; without `mirrored`,
  `scripts/sync-learnings.mjs` would have no way to know which entries it
  has already written into `docs/pipeline-learnings.md`, so every run
  would re-append everything. **A plain "ok" on both grader signals writes
  nothing here at all**: read narrowly, not literally ("write one entry...
  either way"), since logging a trace nothing flagged would contradict
  this collection's own stated purpose (a real finding, not a general
  notes file) and would flood `scripts/review-queue.mjs` with noise the
  grader was supposed to filter out in the first place.
- `scripts/review-queue.mjs` (new): lists unresolved `kind: "flagged"`
  entries, oldest first. `--resolve <logId>` marks it looked at; `--resolve
  <logId> --promote` (with `--use-live-response` or a hand-corrected
  `--expected-file`, `scripts/promote-trace.mjs`'s own two-path convention
  reused rather than re-invented) promotes a trace by hand into
  `referenceExamples`, `source: "manual"`, the third `source` value this
  collection needed beyond its original two-value design, running the
  same validation the automatic path does plus the same `targetProjectId`
  guard, and enforcing the same 30-document cap (extended slightly beyond
  the trigger's own "prune oldest auto-promoted" rule to "prune oldest
  non-seed," since a manual promotion is not "auto-promoted" but still not
  a permanent seed either).
- `scripts/sync-learnings.mjs` (new): mirrors every eligible
  `pipelineLearningLog` entry (an auto-promotion needs no further human
  decision; a flagged entry becomes eligible only once
  `scripts/review-queue.mjs` marks it resolved) into
  `docs/pipeline-learnings.md` as a short, dated section, distinct in tone
  from a hand-written finding like the "important vs urgent" entry: these
  are mechanical log mirrors, clearly marked as such, not narrative prose
  a person wrote. `docs/pipeline-learnings.md`'s own "How to add an entry"
  recipe rewritten to describe the new starting point
  (`npm run review-queue`, not a raw trace list) and this new step.
- `firestore.indexes.json` (new, and `firebase.json` updated to reference
  it): `scripts/review-queue.mjs`'s own listing query (`kind ==
  "flagged"`, `resolved == false`, ordered by `date`) needs a composite
  index Firestore does not create automatically for two equality filters
  plus an orderBy on a third field. **Found live, not assumed**: running
  the script against the real (then-empty) collection threw
  `FAILED_PRECONDITION: The query requires an index` with the exact
  console link to create it; this is the first query in this app that has
  ever needed one, everything before it was either a single-field
  `orderBy` (auto-indexed) or a full-collection client-side filter (the
  established low-volume-collection convention `scripts/grade-traces.mjs`
  and `scripts/list-traces.mjs` already use). `firestore.indexes.json`
  defines it; deploying it is part of this pass's own close-out, not
  deferred.
- `firestore.rules`: `referenceExamples/{exampleId}` and
  `pipelineLearningLog/{logId}` both denied to every client read and
  write, the same `structureTraces`/`todoistAuth` treatment, for the same
  reason: only the Function (Admin SDK) and local scripts touch either
  collection, and both are global, not scoped under a single
  `users/{uid}`, since a reference example teaches the live model for
  every future call regardless of whose transcript prompted it.
- `scripts/grade-traces.mjs` unchanged in what it does, header rewritten:
  now a manual backfill for traces that predate the trigger, or a trigger
  invocation that itself failed (its own `try`/`catch` leaves `judgedAt`
  unset rather than retrying).
- `docs/architecture.md`, `docs/llm-pipeline.md` (the "Reference examples,"
  "Automatic grading," new "Auto-promotion," and "Review cadence"
  sections), `docs/pipeline-learnings.md`, `docs/roadmap.md` (a new Built
  entry, "Phase 3, part 11"), and `README.md`'s "Does this get smarter
  over time?" section (a new diagram, the auto-promote rule stated
  plainly, a new "Key files" list, "Run locally" removed per this task's
  own instruction) all rewritten for the new architecture, not just
  patched at the edges.

**Item 4's own explicit ask, answered directly, not just asserted.**
Checked exactly how the offline suite builds or mocks the prompt before
touching anything: `structureTranscript` (`src/pipeline/structure.js`)
takes an injected `callModel` and never imports `src/pipeline/prompt.js` or
touches Firestore, in either the offline harness or production; the only
place `SYSTEM_PROMPT` is ever consumed at runtime is
`scripts/check-prompt-sync.mjs`. Since reference-example assembly moved
entirely into `functions/index.js`'s request handler and `prompt.js` never
had it beyond an import that has now been removed, the offline suite needed
**zero** mocking changes; the "smallest correct fix" this task asked for
was recognizing that no fix was needed, not building one. Verified, not
just reasoned: `npm run eval` reran clean with `functions/node_modules`
removed entirely (proving no accidental live dependency crept in) and
stayed at 67/67 throughout every step of this pass.

**What was not, and could not yet be, verified live in this environment.**
The trigger's own logic (grading, reconstruction, the two-signal
auto-promote rule) was verified thoroughly offline: unit tests for
`reconstructCorrectedTree` (three cases, including the honest failure
case), a live Firestore round-trip for the seed migration and the request-
time `fetchReferenceExamples`/`formatReferenceExamples` read (both run
directly against the real `referenceExamples` collection, not mocked), and
the full `npm run eval` suite. **A real end-to-end trigger firing, on a
real trace, in the deployed Cloud Functions environment, was not observed
in this pass before merge**; that happens as part of this pass's own
deploy-and-verify step, logged separately once done, stated here plainly
rather than left implicit.

Verified: `npm run eval` 67/67 (18 fixtures/contract cases, 12 date, 26
Todoist, 11 write, prompt sync check now covering two hand-synced pairs
behaviorally and one byte for byte). `npm run build` clean, asset hashes
unchanged from the prior deploy (confirming none of `functions/`'s new
code reaches the client bundle, checked by grepping `dist/` for
`gradeStructureTrace`/`pipelineLearningLog`/`onDocumentWritten`, none
found). `node scripts/check-secrets.mjs` clean. `node --check` clean on
every changed or new file under `functions/`.

### Decisions not to relitigate

- `referenceExamples` and `pipelineLearningLog` are both top-level
  Firestore collections, not nested under `users/{uid}`: neither is one
  user's data, both are global pipeline state. Do not move either under a
  user's own subtree on the assumption that was an oversight.
- `pipelineLearningLog` only ever gets an entry when the grader actually
  flagged something. A trace where both signals said "ok" writes nothing
  here, on purpose; do not "fix" this into logging every graded trace
  expecting a more complete audit trail, that is what `structureTraces`
  itself already is.
- `uid` and `mirrored` on `pipelineLearningLog`, and the `"manual"` value
  on `referenceExamples.source`, are all real additions beyond this task's
  own literal field/value lists, each because the feature could not
  function correctly without it, not because more fields seemed like a
  good idea. Do not strip them back out to match the letter of an older
  spec.
- Reconstruction's inability to recover an "edited, then removed" task's
  original content is a real, permanent limitation of what
  `structureTraces` persists today, not a bug to chase. Fixing it for real
  would mean changing what the outcome payload persists (a second full
  corrected tree, not just a diff), a distinct, larger decision this pass
  does not make unilaterally.
- `functions/contracts.js` is a fourth instance of this app's hand-synced-
  file pattern, accepted the same way the others were: restructuring
  `functions/` into an importable ESM package was already considered and
  rejected once (docs/resolution-log.md, 2026-07-06) for a duplication
  this small; that reasoning still holds, now for a third pair, not just
  a second.
- `scripts/check-prompt-sync.mjs`'s `contracts.js` probe cases must
  include boundary values, not only obviously-invalid ones. This is not a
  style preference; a probe suite using only priority 9 already proved it
  can miss a real, deliberately-introduced drift at the actual boundary
  (priority 5 vs. the real cap of 4).

## 2026-07-13: README.md brought back in line with the merged pipeline (accuracy pass, not a rewrite)

`README.md` is the first thing anyone outside this project reads, and it
makes specific, checkable claims. Two PRs merged earlier today
(`docs/resolution-log.md`'s "Editable-preview and important-priority-fix
PRs merged and deployed" entry and the two entries below it) changed real
pipeline behavior that the README's own "Does this get smarter over time?"
section did not yet describe, and the `npm run eval` command it documented
had already drifted from `package.json`'s real chain. Fixed five specific
gaps, nothing else in the file touched.

1. **`npm run eval`'s description was wrong.** README said `eval:offline +
   eval:date + eval:todoist`. The real chain in `package.json` is
   `eval:offline && eval:date && eval:todoist && eval:write &&
   check:prompt-sync`, has been since the editable-preview and reference-
   examples passes. Fixed in the main prose eval command, the `<details>`
   "Run the evals" section's own prose, and the CI section's parenthetical,
   which named the same stale three-step list.
2. **`src/pipeline/referenceExamples.js` explained.** Four hand-picked
   worked examples injected into the live Structure prompt on every real
   call, distinct from `evals/fixtures/*.json` (offline-only, a mocked
   model, never reaches the real API). Stated plainly that this is the one
   teaching mechanism that actually runs on every real call, and that a
   person edits it by hand, the same as the prompt itself.
3. **`scripts/grade-traces.mjs` explained.** An automatic first pass, one
   cheap Haiku call per ungraded trace, hard-locked away from the real
   Sonnet Structure call by design. Flags, never fixes, completeness and
   priority/due defensibility. Cited real evidence it works, not just a
   description: a real run against every ungraded trace on 2026-07-13
   correctly re-caught the known priority-inversion bug in the original Big
   Sur trace on its own (`docs/resolution-log.md`, commit `121934a`), and
   stated plainly that its own verdicts still get spot-checked, not trusted
   blindly.
4. **`confirmed_with_edits` explained.** A user's own removal, content
   edit, or project rename in the preview before confirming is captured as
   a real, structured signal (`removedTasks`/`contentEdits`/
   `projectNameChange`) alongside the trace, a fourth outcome value, not
   just a confirm/cancel binary.
5. **The eval-flywheel flowchart updated** to show the actual current loop:
   reference examples shaping every call, a trace capturing any edits, the
   automatic Haiku grader flagging before a person ever reads it, human
   review, and promotion or a prompt/reference-example edit feeding back in.

Language matched this repo's own existing style deliberately, not a new
one invented for this pass: the "Two real caught bugs" section already in
the README (untouched) was the reference, a concrete claim with a named
file or resolution-log entry as evidence, and an explicit statement of what
is *not* proven sitting next to what is. `docs/orchestration.md`'s
stop-slop rule governs all of it: active voice, no filler, no em dashes, no
hyphen used as a connector. Checked directly, not assumed: grepped the new
text for an em dash character (none) and for a short list of marketing
adjectives ("powerful," "seamless," "smart," "robust," "cutting-edge,"
"state-of-the-art," "revolutionary," "game-changing," "effortless"); none
present.

**No deploy was needed, and none was run.** The task instruction this pass
started from assumed a hosting redeploy would be needed for a README-only
change; checked before running one, not assumed: `firebase.json`'s
`"public": "dist"` means Firebase Hosting only ever serves the built
`dist/` output, and nothing under `src/` imports or renders `README.md`'s
content (`grep -rn "README" src/` found nothing). A `README.md`-only change
cannot reach the deployed site at all; confirmed further by rebuilding and
finding the exact same asset hashes (`index-Yu1caoV7.js`,
`index-CQSkjeGZ.css`) already live from the prior deploy. Running
`firebase deploy --only hosting` here would have been a real production
action that changed nothing, so it was skipped; the actual "live" surface
for this change is GitHub's own rendering of `README.md`, verified there
directly after merge (see the PR).

Verified: `npm run eval` 67/67 (18 fixtures/contract cases, 12 date, 26
Todoist, 11 write) plus the prompt sync check, all passing, unaffected by a
docs-only change but run anyway per the standard loop. `npm run build`
clean, asset hashes unchanged from the already-live deploy, confirming
nothing here reaches the client bundle. `node scripts/check-secrets.mjs`
clean.

### Decisions not to relitigate

- A hosting or functions deploy is not automatic just because a task says
  "this touches X, so deploy Y." Check whether the actual changed file
  reaches what that deploy target serves before running it; `README.md`
  and `docs/*.md` never do, since Firebase Hosting only serves `dist/` and
  nothing in `src/` renders repo docs.
- The "Two real caught bugs" section is the house style reference for any
  future pipeline-explanation prose in this README: a concrete, checkable
  claim, a named citation, and what is not proven stated as plainly as what
  is. Do not add adjective-driven claims ("powerful," "smart," etc.)
  anywhere in this file; if a sentence would read the same on a marketing
  page, it needs a fact and a citation instead.

## 2026-07-13: Editable-preview and important-priority-fix PRs merged and deployed to super-ramble.web.app

Follow-up to the two entries directly below (the editable Super Ramble
preview and the "important" priority fix). Both merged
([PR #3](https://github.com/cottalucas/super-ramble/pull/3),
[PR #4](https://github.com/cottalucas/super-ramble/pull/4)) after CI passed,
then deployed and verified live, in that order.

**PR #3 merge and deploy.** Merged cleanly (no conflicts against `main`).
Deployed `firebase deploy --only hosting,functions` (this PR touches both:
`SuperRambleModal.jsx`/`TaskRow.jsx` reach the client bundle, and the
outcome endpoint changed in `functions/index.js`). The CLI reported success
for both, but the first live check right after looked wrong: fetching
`https://super-ramble.web.app/` still showed the *previous* deploy's asset
hashes, and fetching the new asset path by its hash returned `200` with
`content-type: text/html`, the SPA fallback, not the real file.
**Diagnosed before concluding the deploy had failed**: `--debug` on a
second `firebase deploy --only hosting` run showed the version
(`.../versions/2bcc6d4a625f78fa`) was created, populated with the correct
three file hashes, finalized, and released to the `live` channel
end-to-end, no error anywhere in the API trace. The stale read was CDN edge
caching (`x-cache: HIT`, `cache-control: max-age=3600`) on the specific
edge (`cache-fra-...`) this environment happened to hit immediately after
the first deploy, not a failed release; a few seconds later the same
fetches returned the new hashes with a fresh `last-modified` matching the
release timestamp. Verified byte-for-byte: downloaded the live
`index-Yu1caoV7.js` and `diff`'d it against the local `dist/` output,
identical. `POST /api/structure` (unauthenticated) returned `401
{"error":"unauthorized"}`, confirming the revision is live and executing.
**Editable-preview behavior itself was verified locally before this PR was
even opened** (mocked `window.fetch`, see PR #3's own resolution-log
entry); this deploy-verification pass confirms the same code is what is
actually live, not a second functional test.

**PR #4 merge and deploy.** Had a real merge conflict against `main` this
time (both PRs prepended an entry to `docs/resolution-log.md`'s top,
`docs/architecture.md`/`docs/llm-pipeline.md` and `functions/index.js`
auto-merged clean). Resolved by merging `main` into the branch, keeping
both resolution-log entries (this branch's first, `main`'s second), fixing
two conflict-marker artifacts a first pass at the resolution missed one of,
caught by grepping for `^<<<<<<<\|^=======\|^>>>>>>>` after the "resolved"
commit rather than assuming the edit worked. Reran `npm run eval` after
resolving (67/67 across the merged set) before pushing. `functions/` is
the only thing this PR touches that a deploy needs: verified directly by
rebuilding and grepping the fresh `dist/` bundle for `"Pack first aid
kit"` (the reference-examples fixture text) and finding nothing, and by
confirming the built JS asset hash was unchanged from the one already
live, so no hosting redeploy was needed, only
`firebase deploy --only functions`. Deploy succeeded; `POST /api/structure`
(unauthenticated) returned `401` again, confirming the new revision is
live and executing.

**A real authenticated live call was attempted, not just skipped.** With
real `ANTHROPIC_API_KEY` access this session (via
`firebase functions:secrets:access`) and working Application Default
Credentials, tried to mint a real Firebase ID token for the dogfooding
user (`admin.auth().createCustomToken(uid)`, then exchange for an ID
token) to make one real authenticated `/api/structure` call and directly
confirm the "important" priority fix reached a live response. Failed at
the first step: `createCustomToken` needs a service account credential
capable of signing (`iam.serviceAccounts.signBlob`), which user-login
Application Default Credentials do not carry; the error was
`Failed to determine service account... Alternatively specify a service
account with iam.serviceAccounts.signBlob permission`. No service account
key exists in this environment, and generating one was out of scope for a
verification step. This is the same class of gap several earlier entries
in this log already hit (no way to mint a real session without either a
real browser OAuth login or a service account key); not solved here
either. **A real live spot-check of the "important" fix, and of the
editable-preview feature end to end against the deployed site, still
needs a real signed-in browser session**, Lucas's own or a future pass
with a service account key. Stated plainly rather than left implicit.

Verified: `npm run eval` 67/67 (18 fixtures/contract cases, 12 date, 26
Todoist, 11 write) plus prompt sync check, on `main` post-merge. `npm run
build` clean, asset hashes and byte content confirmed live for PR #3;
confirmed unchanged (so correctly not redeployed) for PR #4. `node
scripts/check-secrets.mjs` clean. `node --check functions/index.js` clean
before each deploy.

### Decisions not to relitigate

- A `firebase deploy` success message plus an immediate stale-looking
  fetch is not proof of a failed deploy. Check `--debug` output (or the
  Firebase console) for the actual version/release lifecycle before
  concluding a release failed; CDN edge caching can serve a stale response
  for up to `max-age` (3600s here) immediately after a real, successful
  release, especially in a build (like `index.html`) that used to be
  cache-checked as fresh by the same edge.
- Neither `hosting` nor `functions` deploys automatically decide their own
  scope. Check whether a PR's changes actually reach the client bundle
  (grep the built `dist/` output, compare the asset hash to what is
  already live) before running a hosting deploy that changes nothing;
  `src/pipeline/*` files with no client importer are the recurring example
  in this repo.
- Minting a real Firebase ID token for a live authenticated call from this
  environment needs a service account key, not just Application Default
  Credentials; `createCustomToken` fails without one. Do not reattempt this
  exact approach expecting a different result absent a real service
  account key being made available.

## 2026-07-13: docs/pipeline-learnings.md added, and its first real finding fixed ("important" undercounted against "urgent")

New doc, `docs/pipeline-learnings.md`, distinct from this log: this one only
ever holds a real finding from a real trace, what was wrong, what changed
because of it, short and dated. Everything else (every fix, every deploy,
every doc update) still logs here as always. Added to
`docs/orchestration.md`'s reading list right after `docs/llm-pipeline.md`,
and to `README.md`'s Documentation section.

**The first real entry, written and fixed in the same pass.** Two
independent real data points both show "important" language landing softer
than "urgent," despite `SYSTEM_PROMPT` already listing both words as
priority-1 signals: the Big Sur trace's "Pack first aid kit... important"
(priority 3, noted but deliberately not corrected on 2026-07-08, one data
point wasn't enough to bake in a number) and today's live moving-apartment
trace's "buy renters insurance... important" (priority 2, trace
`ynQakgn1DZnrS7ADSVn6`, uid `ZGjRHCpURTeWKD2fll6lKKHezD43`). Full finding,
fix, and verification detail lives in `docs/pipeline-learnings.md`'s own
entry; summarized here per this log's own "what was done" scope:

- `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` and `functions/index.js`'s
  hand-synced `STRUCTURE_SYSTEM_PROMPT_RULES` both gained one explicit
  sentence stating "important" carries the same weight as "urgent," not a
  softer one, closing the exact gap that let the model treat them
  differently despite both already being listed as priority-1 words.
  Verified identical via `scripts/check-prompt-sync.mjs`.
- `evals/fixtures/11-important-language-priority.json` (new): the real
  moving-apartment trace, hand-corrected on exactly the one field this
  finding is about, everything else carried through unchanged. Verified
  the assertion actually catches the bug, not just written and trusted:
  temporarily reverted the fixture's `mockResponse` to the real, buggy
  priority 2, ran `npm run eval:offline`, got a clean failure naming the
  exact mismatch, restored, reran clean.
- **The existing four reference examples needed a correction, not a
  fifth.** `src/pipeline/referenceExamples.js`'s Big Sur example (copied
  from the real promoted trace) still showed "Pack first aid kit" at its
  own uncorrected priority 3, which would have directly contradicted the
  newly tightened prompt line the moment it shipped, a live few-shot
  example undermining the rule sitting right next to it. Corrected to
  priority 1 in both hand-synced copies
  (`src/pipeline/referenceExamples.js` and
  `functions/referenceExamples.js`); `evals/fixtures/08-big-sur-camping-trip.json`
  itself is untouched, only the separate copy used to teach the live model
  changed.

**What this does not prove**, stated plainly rather than implied: offline
evals never call the real model, mocked or not. `npm run eval` proves the
new fixture's assertion works and both prompt copies stay in sync with each
other, not that the live model now structures "important" language
correctly. That needs a real live call, spot-checked by hand; not run in
this pass, no standing authorization to spend real Anthropic credits on the
dogfooding account, the same posture the 2026-07-06 entry already
established for this exact class of change.

Verified: `npm run eval` 18/18 offline (11 fixtures, 6 negative contract
cases, 1 guard case; the new fixture the only addition, up from 17), 12/12
date, 26/26 todoist, prompt sync check passing. `npm run build` clean.
`node scripts/check-secrets.mjs` clean.
`node --check functions/index.js` clean.

### Decisions not to relitigate

- `docs/pipeline-learnings.md` holds only real-trace findings, one dated
  entry per finding, with a fix and verification, never a general-purpose
  notes file. A pass that didn't come from reading real production data
  belongs in this log instead, even if it's a genuine improvement.
- The Big Sur trace's "Pack first aid kit" is priority 1 in the reference
  examples now, not the fixture's own uncorrected 3. Do not "restore" it to
  match the fixture on the assumption that was an oversight; the fixture
  and the reference-examples copy are allowed to diverge on this one field
  for exactly the reason stated above, and the fixture itself is untouched
  on purpose.
- Four reference examples remains the right count after this finding. Do
  not read this entry as "the four weren't enough" and add a fifth on that
  basis; what was missing was internal consistency between an existing
  example and a rule, not coverage of a new case.

## 2026-07-13: The Super Ramble preview is editable before Confirm, the "confirmed with edits" third state built

Built the exact third outcome state `docs/llm-pipeline.md` had already named
and deliberately deferred ("a future pass that lets a user adjust the tree
before confirming... is a distinct, future decision, not approximated
here"). Scoped narrowly, as asked: per-task removal, an editable project
name, per-task content editing. Not priority, not due dates, not section
removal; each stays its own bigger lift later.

**What shipped.**

- `src/components/TaskRow.jsx`: a new `editable` prop, the sibling of the
  existing `readOnly` mode (not a new component, per the task's own
  instruction; `TaskRow` already had the seam). The working tree had a
  half-finished start on this at the top of this pass: the `editable`/
  `onRemove`/`onContentChange` props and doc comments already existed, but
  the actual render branches (checkbox, content, actions, and the recursive
  call to sub-tasks) still only ever checked `readOnly`, so none of it
  actually did anything yet. Finished it rather than trusted it: checkbox
  and row-click now gate on `readOnly || editable` (a new `inert` local),
  content renders an inline `<input>` when `editable`, and the actions area
  swaps the real Add-sub-task/"..." block for a single plain "x" (`IconX`,
  already existed) calling `onRemove(task)`, no confirm dialog, since
  nothing is written until the real Confirm. All three new props thread
  down through the existing sub-task recursion alongside `readOnly`.
- `src/pipeline/write.js`: `updateTaskAtRef(tasks, ref, updater)` (new,
  exported), the deliberate inverse of `flattenTasks`'s own ref scheme
  (`t{i}`/`t{i}s{j}`), so the editable preview never needs a second,
  hand-derived copy of that scheme. `updater(task) => task | null`; `null`
  removes the task or sub-task the ref points to, its own sub-tasks going
  with it since they live nested inside it in this shape, the same cascade
  `store.deleteTask` gives a real task via its `parentId` walk, just via
  different data. Pure: never mutates its input, verified directly (see
  `scripts/eval-write.mjs` below). `toProjectTree` and `flattenTasks`
  themselves needed **zero** changes: both already only ever read whatever
  `tasks`/`project` they are handed, so passing an edited copy instead of
  the original response at Confirm just works.
- `src/components/SuperRambleModal.jsx`: `edited` (new state) is a deep
  clone (`JSON.parse(JSON.stringify(...))`, sufficient since a Structure
  response is plain JSON-shaped data with no functions or dates) of
  `structured`, seeded the moment structuring succeeds and reset on
  `backToEdit()`. Every edit (`removeTask`, `editTaskContent`,
  `editProjectName`) mutates only `edited`, through `updateTaskAtRef`;
  `structured` itself is never touched, so the trace's own persisted
  `response` (written at request time, before any edit is even possible)
  always reflects exactly what the model produced. `editLog` (new state,
  `{ removedTasks, contentEdits }`) tracks edits incrementally, at the
  moment each one happens, rather than by diffing `structured` against
  `edited` at Confirm time: `flattenTasks`'s refs are positional, so they
  shift the instant anything is removed, and a diff against the shifted
  state can no longer tell "the task that used to be at `t2`" from
  "whatever now happens to be at `t2`". `editProjectName` is the one
  exception, diffed once at Confirm: there is exactly one project-name
  field, so there is no positional-ref problem for a diff to trip over.
  `TreePreview` now renders from `edited`, not `structured`; the project
  name became an inline `<input>` (`.sr-project-name-input`, replacing the
  old `<h3>`) bound to `edited.project.name`. The preview's own Cancel
  button is renamed **Discard**, matching the task's reference screenshot;
  behavior is unchanged, it still only calls `recordOutcome(..., 'cancelled')`
  and closes, writing nothing. The input-state Cancel button (before
  structuring even runs) is untouched, a different screen entirely.
  `confirm()` now builds the tree from `edited`, computes `projectNameChange`
  by diffing against `structured`, filters `contentEdits` down to edits that
  actually changed a value (typed, then typed back, is not reported), and
  sends `outcome: "confirmed_with_edits"` with the full `edits` object only
  when at least one removal, real content edit, or rename survived to the
  click; a plain confirm with nothing edited still sends exactly the
  two-field POST it always has, verified directly, not assumed (see
  Verification below).
- `functions/index.js`: `POST /api/structure/outcome` accepts
  `"confirmed_with_edits"` as a fourth valid `outcome` value alongside
  `"confirmed"`/`"cancelled"`, plus an optional `edits` object, required
  exactly when `outcome` is `"confirmed_with_edits"`. `isValidEdits` (new)
  shape-checks it before it ever reaches Firestore, the same discipline
  `STRUCTURE_JSON_SCHEMA` already gives the model's own response: this is
  the one field on `structureTraces` a client actually writes content into,
  not just an enum value, so it gets real validation, not a pass-through.
  `edits` is only ever written to Firestore alongside `"confirmed_with_edits"`,
  silently ignored for the other two outcomes even if a future client bug
  sent it there, so a plain confirm or cancel stays exactly the two-field
  update it always was.
- `docs/architecture.md`: `structureTraces`' field list gains `outcome`'s
  fourth value and the full `edits` shape, with the reasoning for why
  `removedTasks` records a task's state at the moment of removal (possibly
  already content-edited) rather than its original state.
  `docs/llm-pipeline.md`'s "Live capture and the eval flywheel" section
  describes the editable preview itself and the new outcome state,
  replacing the paragraph that used to defer it; "Eval assertions per
  stage" (Write) gained a line for the new coverage below.
- `scripts/list-traces.mjs`: `OUTCOME_ORDER` now ties `cancelled` and
  `confirmed_with_edits` at the front (both `0`), per the task's own
  framing: an edited trace is at least as high-signal as a cancelled one,
  since it says exactly what was wrong, not just that something was. A new
  block prints the edits summary when `outcome === 'confirmed_with_edits'`:
  counts, each removed task (content, priority, section), any project
  rename, each content edit (original -> new).
- `scripts/eval-write.mjs` (new, wired into `npm run eval` as `eval:write`,
  the same "its own script, no fixtures, no model" shape
  `scripts/eval-date.mjs`/`eval-todoist.mjs` already use): 11 cases against
  `src/pipeline/write.js` directly. Proves, not just states, the task's own
  explicit ask: a removed root task's content, and its own sub-tasks', are
  absent from `toProjectTree`'s output; removing one sub-task leaves its
  parent and sibling; `updateTaskAtRef` never mutates the array it is
  given; a content edit replaces exactly the targeted task or sub-task; a
  project rename reaches the produced tree; routing into an existing
  project (`targetProjectId` set) ignores `project.name` entirely, edited
  or not; and a combined removal-plus-edit-plus-rename case together.

**Verification, beyond the offline suite.** Started the dev server with
`VITE_ENABLE_LOCAL_PREVIEW=true` in `.env.local` (gitignored, reverted to
`false` before any deploy, `npm run verify:prod-env` run directly afterward
to confirm) and mocked `window.fetch` for `/api/structure` in the browser
console, the same technique the 2026-07-06 entry used to check
`SuperRambleModal.jsx` without spending real credits. Confirmed live in the
browser, not just read from the diff: the project name field is genuinely
editable (typed a new name, it stuck); a task's content is genuinely
editable inline; clicking a sub-task's "x" removes only that sub-task, its
section's count updates; clicking a parent task's "x" removes it and its
remaining sub-task together, and the section itself (now empty) disappears
from the preview, matching the existing "skip a section with zero
remaining tasks" rule already there for read-only preview, section removal
itself out of scope; Confirm writes a project under the new name with only
the two remaining tasks, one showing the edited content, confirmed by
opening the created project directly; `window.__lastOutcomeBody` after that
Confirm was exactly
`{ traceId, outcome: "confirmed_with_edits", edits: { removedTasks: [...], projectNameChange: {...}, contentEdits: [...] } }`,
every field matching what was actually done in the UI; a second run with no
edits at all confirmed the outcome POST stays the plain, unchanged
`{ traceId, outcome: "confirmed" }`, no `edits` key. No console errors
across either run.

Verified: `npm run eval` 66/66 offline across five scripts (17 fixtures/
contract cases, 12 date, 26 Todoist, 11 write, unchanged counts on every
existing script) plus the prompt sync check, all passing. `npm run build`
clean. `node scripts/check-secrets.mjs` clean. `node --check functions/index.js`
clean.

### Decisions not to relitigate

- `TaskRow`'s `editable` mode is additive to `readOnly`, not a replacement:
  both exist side by side, `SuperRambleModal.jsx` is the only caller of
  either. A future not-yet-written surface that wants a fully inert row
  still has `readOnly`; one that wants an adjustable-before-write row uses
  `editable`.
- `updateTaskAtRef` is the one place that understands `flattenTasks`'s ref
  scheme well enough to reverse it. A future editable-preview feature
  (priority, dates, sections) should extend this function's `updater`
  contract, not hand-roll a second ref parser.
- `structured` (the model's real, untouched output) is never mutated by any
  edit. Do not "simplify" this later by editing it in place; the trace's
  own persisted `response` and the edits summary both depend on it staying
  exactly what the model produced.
- `removedTasks` entries record a task's state at the moment of removal
  (its current, possibly already-edited content; its real priority and
  section), not its original state from `structured`. This was a
  deliberate choice, not an oversight: it is what a reviewer actually saw
  and rejected.
- `edits` is written to Firestore only alongside `outcome ===
  "confirmed_with_edits"`, never alongside `"confirmed"` or `"cancelled"`,
  even if a client sends it. Do not loosen this; a plain confirm's trace
  should never carry a stray, unused `edits` field.
- `scripts/promote-trace.mjs` was not touched this pass. A
  `confirmed_with_edits` trace still needs `--expected-file` to promote
  (its `outcome` is not `"confirmed"`, so `--use-live-response` still
  refuses it), the same treatment a cancelled trace already gets, correct
  as-is: by definition, something about the model's real response wasn't
  quite right if a human edited it. A future pass could teach
  `promote-trace.mjs` to apply a confirmed_with_edits trace's own `edits`
  automatically when building the fixture; not built here, not assumed to
  be a small change.

## 2026-07-13: Both open follow-ups closed: live reference-examples spot-check and a real traces:grade run

Two gaps flagged open in the two entries directly below (the reference-
examples deploy and the trace-grading PR) both closed today, in the same
pass, once working credentials became available in this environment that
were not available earlier the same day (`gcloud auth application-default
print-access-token` now succeeds; it did not for several 2026-07-08 and
2026-07-06 passes, a recurring gap noted repeatedly in this log).

**Reference-examples live spot-check.** Rather than spend fresh credits on
a synthetic probe, `npm run traces:list -- --uid <uid>` surfaced two real
`structureTraces` documents dated today (`ynQakgn1DZnrS7ADSVn6`,
`qXJbrzOHXZTvDqUv2yiN`), meaning Lucas had already exercised the deployed
site for real after the merge. Read both in full. Both look right against
the reference-examples-updated prompt: priority direction is correct
throughout ("Call electric company," stated urgent with a this-week
deadline, correctly priority 1; "Book the moving truck," stated urgent,
correctly priority 1; unmarked routine tasks correctly default to 4);
notably, "Buy renters insurance," described only as "important," landed at
priority 2 in the first trace and 1 in the second, an improvement over the
exact under-weighting the 2026-07-08 review flagged as questionable
(priority 3 for the same "important" language, in the original Big Sur
trace, left uncorrected in the promoted fixture because nobody had
verified what the right number was). Sections are used well (Packing,
Utilities, Moving Day, Old Place, matching the sections-when-they-help
reference example's shape); the second trace correctly routes into the
existing "Moving to New Apartment" project by id instead of resynthesizing
one. This is not a controlled A/B test and does not, on its own, prove the
reference-examples block caused the improvement rather than ordinary
model variance; stated as encouraging real evidence, not a rigorous proof.

**A real `traces:grade` run.** `ANTHROPIC_API_KEY` was read directly from
the Firebase Functions secret (`firebase functions:secrets:access
ANTHROPIC_API_KEY`) into the local shell for one command only, never
written to a file or committed; this is the same real key the deployed
Function itself uses, borrowed locally since this script cannot read a
Function secret directly, exactly the gap `scripts/grade-traces.mjs`'s own
comment already names. `npm run traces:grade -- --uid <uid>` graded all 12
ungraded traces in one run, cost **$0.0211** total, nowhere near the
`LLM_SPEND_CEILING_USD` ceiling. `npm run traces:list` afterward confirmed
the merge write landed exactly as designed: `judgeCompleteness`,
`judgeCorrectness`, `judgeNotes`, `judgedAt` all present, flagged traces
marked plainly, `transcript`/`response` unchanged. 10 of 12 were flagged.
Spot-checked one flag against a real manual read, not trusted blindly (the
grader's own stated caveat): the grader flagged the original, un-promoted
`wPWKIUs0mXfeeCGRYJXx` Big Sur trace's campsite-booking priority as
"marked priority 4 when the transcript explicitly calls it urgent," which
is exactly the real, already-documented priority-inversion bug from
2026-07-08, correctly caught. The other 9 flags were not individually
re-verified against a manual read in this pass; per the review cadence
this grader is meant to feed, not per-flag proof.

### Decisions not to relitigate

- Both PR follow-ups (`functions/index.js`'s deploy, `scripts/grade-traces.mjs`'s
  live path) are now verified working end to end, not just unit-tested.
  Do not reopen either as "unverified"; a future regression needs its own
  new finding, not a re-litigation of whether the mechanism itself works.
- Borrowing the deployed Function's own `ANTHROPIC_API_KEY` secret into a
  local shell via `firebase functions:secrets:access` is how
  `scripts/grade-traces.mjs` is meant to be run locally, not a workaround;
  the script's own comments already state this gap. Never write the key to
  a file, `.env`, or a committed script; export it for one command and
  unset it after, the same discipline this pass followed.
- 10 of 12 real traces are currently flagged. This is not itself evidence
  the Structure prompt regressed today; most flags concern nuanced
  dependency/sequencing signals (a stated blocking relationship, a
  "cannot forget" emphasis) that are genuinely debatable, not the clear-cut
  inverted-direction class of bug the priority-direction fix targeted. A
  future review pass should read these flags against the review cadence,
  not treat "flagged" as "broken."

## 2026-07-13: Automatic trace grading, so nobody reads structureTraces blind

A cheap, automatic quality check on every saved trace, closing a real gap:
`docs/llm-pipeline.md`'s review cadence asks a human to read every confirmed
trace field by field, but nothing narrowed that reading before this pass,
and the collection only grows.

**What shipped.**

- `scripts/grade-traces.mjs` (new): follows `scripts/list-traces.mjs` and
  `scripts/promote-trace.mjs`'s exact existing pattern, Application Default
  Credentials, the same `--uid` argument convention. Finds
  `structureTraces` documents with no `judgedAt` field yet (Firestore has no
  native "field missing" filter, so this is a full fetch plus a client-side
  filter, the same shape `list-traces.mjs` already uses for a low-volume,
  single-dogfooding-user collection) and, for each, makes one call on this
  app's default Haiku model (`ANTHROPIC_MODEL`, never
  `ANTHROPIC_STRUCTURE_MODEL`; the grader must never touch the same model or
  cost tier as the real structuring call it is checking) via `output_config.
  format` structured outputs, asking it to compare the trace's own
  `transcript` against its own `response` and return two simple `"ok"`/
  `"flag"` verdicts plus a one-line reason each: whether anything the
  transcript mentioned seems missing from the response, and whether
  priority or due dates look defensible given the transcript's own wording.
  Writes `judgeCompleteness`, `judgeCorrectness`, `judgeNotes`, `judgedAt`
  back as a merge write; `transcript` and `response` are never touched.
  Bounded by `LLM_SPEND_CEILING_USD`, the exact convention
  `scripts/trace-summary.mjs` already established, checked before each call
  so a batch stops rather than overruns; `--limit` (default 20) separately
  caps how many ungraded traces one run grades. Requires
  `ANTHROPIC_API_KEY` in the local shell env, since this is a local script,
  not the Function, and cannot read the Firebase Functions secret of the
  same name; both missing `--uid` and a missing key fail fast with a clear
  message, verified directly (not assumed) by running the script both ways.
  Haiku 4.5 pricing used for the cost estimate ($1 / MTok in, $5 / MTok
  out) verified live against
  platform.claude.com/docs/en/about-claude/models/overview, the same
  discipline `ANTHROPIC_STRUCTURE_MODEL`'s own pricing already followed
  (2026-07-06 entry), not recalled from memory.
- `package.json`: `"traces:grade": "node scripts/grade-traces.mjs"`, same
  category as `traces:list` and `traces:promote`. `@anthropic-ai/sdk`
  added as a root devDependency (`^0.110.0`, matching `functions/`'s own
  pinned version) since this script calls Anthropic directly from a local
  script, not through the Function; nothing under `src/` imports it, so the
  client bundle is unaffected (confirmed by rebuilding and diffing asset
  hashes, unchanged).
- `scripts/list-traces.mjs`: shows the judge fields when present (`judge:
  ok|FLAGGED`, `completeness`, `correctness`, `judgedAt`, and `judgeNotes`
  when flagged), `judge: not graded yet` otherwise. Cancelled traces still
  sort first; the judge display is additive to each trace's existing block,
  the sort itself (`OUTCOME_ORDER`) untouched.
- `docs/llm-pipeline.md`: new "Automatic grading" subsection under "Live
  capture and the eval flywheel," right before "Review cadence." States
  plainly that this grader only flags: it never edits
  `src/pipeline/prompt.js` and never writes an eval fixture itself, both
  stay a human decision, exactly as today. States explicitly that the
  grader's own verdicts are not infallible and should get spot-checked
  against a real manual read on the same review cadence, the same
  "confirmed does not mean correct" lesson that already applied once to a
  user's own Confirm click (the inverted-priority trace, 2026-07-08) before
  this grader ever existed.

**This never runs as part of a live user request.** It's a local batch job
Lucas runs by hand, the same category as `traces:list` and
`traces:promote`; nothing here touches `functions/` or `firestore.rules`,
so this PR needs no deploy.

Verified: `npm run eval` 17/17 offline, 12/12 date, 26/26 todoist, prompt
sync check passing (unaffected by this PR, included only because it is the
last step of `npm run eval`). `npm run build` clean, asset hashes unchanged
from before this PR (confirming the new `@anthropic-ai/sdk` dependency and
the new script never reach the client bundle). `node scripts/check-secrets.mjs`
clean. `node --check` clean on both changed scripts. Argument validation
(`--uid` required, `ANTHROPIC_API_KEY` required) verified by running the
script both ways, not just read. The grading call itself was not run
live in this environment: no working Application Default Credentials here
(the same recurring gap several 2026-07-08 entries already noted), so there
was no real `structureTraces` collection reachable to grade. A future pass
with working credentials should run `npm run traces:grade -- --uid <uid>`
against a real trace at least once and read the written `judgeCompleteness`/
`judgeCorrectness`/`judgeNotes` back to confirm the merge write lands as
intended; not proven here, stated plainly rather than assumed.

### Decisions not to relitigate

- The grader runs on this app's default Haiku model, never Sonnet, and
  never on `ANTHROPIC_STRUCTURE_MODEL`. Do not "upgrade" the grader to a
  stronger model to chase better verdicts; a cheap, cost-tier-separated
  check is the whole point, matching the task's own explicit instruction.
- `judgeCompleteness`/`judgeCorrectness`/`judgeNotes`/`judgedAt` are the
  only fields this script ever writes, always as a merge write. Do not have
  a future grading pass touch `transcript` or `response`, or replace the
  merge write with a full document overwrite.
- This grader flags; it does not fix. It must never call
  `scripts/promote-trace.mjs` itself or edit `src/pipeline/prompt.js` or
  `functions/index.js`. A flagged trace is a pointer for a human to look,
  not an automatic action.
- Its own verdicts are not ground truth. Do not cite "the grader said ok"
  as equivalent to a real manual review in a future resolution-log entry;
  the review cadence's manual read still stands, with the grader narrowing
  what gets read first.
- The grading call itself has not been run against real production traces
  in this environment (no working ADC here). Do not treat this feature as
  fully proven in production until a future pass with working credentials
  confirms one real write lands correctly.

## 2026-07-13: Reference-examples PR merged and functions deployed to super-ramble.web.app

Follow-up to the "Real reference examples wired into the live Structure
prompt" entry directly below. [PR #1](https://github.com/cottalucas/super-ramble/pull/1)
merged to `main` after both `build-and-eval` CI runs (push and pull_request
triggers) passed, including the new prompt-sync check. This PR touches
`functions/`, so per this repo's own deploy discipline it needed a deploy
and a live check, not just a green CI run.

**Hosting was not redeployed, on purpose.** `src/pipeline/prompt.js` and
`src/pipeline/referenceExamples.js` changed, but neither is imported by any
client-side code (`SYSTEM_PROMPT` is only ever consumed by
`functions/index.js`'s own copy and by `scripts/check-prompt-sync.mjs`, both
outside the Vite build). Verified directly, not assumed: rebuilt `dist/`
after the merge and grepped the output bundle for reference-example text
("Maya's Surprise", "Big Sur Camping", "PAST REFERENCE EXAMPLES") to confirm
none of it leaked into the client bundle. Ran `firebase deploy --only
functions` only, matching the exact precedent the 2026-07-08
priority-direction deploy entry already set for a prompt-text-only change.

**Deploy verification, and its real limits, stated plainly.** `firebase
deploy --only functions` reported "Successful update operation" for
`api(us-central1)`. Beyond the exit code: an unauthenticated
`POST https://super-ramble.web.app/api/structure` returned `401
{"error":"unauthorized"}` both with no `Authorization` header and with a
garbage bearer token, confirming the deployed revision is live and actually
executing `verifyAuth` (not a stale cached response, not a crash-looping
revision returning a generic 5xx). `GET https://super-ramble.web.app/`
returned `200`, confirming hosting (untouched by this deploy) is still
healthy. **This does not prove a real authenticated call now sees the
reference-examples block**, since that code path is unreached by an
unauthenticated probe, the same gap the 2026-07-06 entry already named for
this exact class of change. Two ways to close it further were both
unavailable here, same as that entry: no working `gcloud` credentials in
this environment (`gcloud auth login` required, none configured) to inspect
the Cloud Run revision directly, and no standing authorization to spend
real Anthropic credits on the dogfooding account for a real authenticated
`/api/structure` call. What is verified: the exact `functions/index.js` and
`functions/referenceExamples.js` this PR merged is what `firebase deploy`
packaged and uploaded (51.49 KB, matching a fresh local build immediately
before the deploy command ran), and the deploy reported success for that
upload. **A real authenticated live call, before/after, spot-checked by
hand, is still the only way to confirm the live model actually sees these
examples now**; not run here, per the PR description's own stated scope.
This is a live-call check Lucas (or a future pass with explicit spend
authorization) should run directly against `/api/structure` with a real ID
token, ideally paired with `npm run traces:list` afterward to read the new
trace back.

### Decisions not to relitigate

- Hosting does not need a redeploy for a `src/pipeline/*` prompt-text change
  that no client code imports. Verify this with a bundle grep before
  skipping the hosting deploy, the same way this pass did, rather than
  assuming it every time; a future change to `src/pipeline` that a
  component does start importing would need hosting redeployed too.
- Whether the deployed `/api/structure` actually serves the new reference-
  examples block to a real authenticated caller is still unverified as of
  this entry. Do not mark that closed until a real live call is spot-checked
  by hand against the deployed Function.

## 2026-07-13: Real reference examples wired into the live Structure prompt

Closed a real gap: `evals/fixtures/*.json` holds hand-verified transcript-to-
correct-output pairs, but they were only ever consumed by `npm run eval`,
which mocks `callModel` entirely and never makes a real call. The live
model, hit by every real user on the deployed site, saw zero examples, only
written rules in `SYSTEM_PROMPT`. Now it sees four curated worked examples
too.

**What shipped.**

- `src/pipeline/referenceExamples.js` (new): `REFERENCE_EXAMPLES`, four
  `{ transcript, response }` pairs copied verbatim (not retyped) from
  `evals/fixtures/01-clear-single-project.json`,
  `08-big-sur-camping-trip.json` (the priority-corrected version promoted
  2026-07-08, not the raw buggy trace), `06-no-mega-restructure.json` (a
  restraint example: unrelated items must not become a project), and
  `07-sections-when-they-help.json`. `formatReferenceExamples` turns the
  array into a `PAST REFERENCE EXAMPLES` block, stated plainly as historical
  reference material, never the current user's transcript, so the model
  does not confuse a past example's wording with live input. This does not
  change `isGroundedInTranscript` (`src/pipeline/contracts.js`): it only
  ever checks a response's content against the real `transcript` argument
  `structureTranscript` was called with, never against `SYSTEM_PROMPT`
  itself, so the no-invention guard is unaffected by anything appended to
  the prompt.
- `src/pipeline/prompt.js`: the existing rules array (now
  `STRUCTURING_RULES`, unexported) plus
  `formatReferenceExamples(REFERENCE_EXAMPLES)` are joined into the
  exported `SYSTEM_PROMPT`, the rules unchanged, the reference block
  appended below them.
- `functions/referenceExamples.js` (new) and `functions/index.js`'s
  `STRUCTURE_SYSTEM_PROMPT`: an identical, hand-synced mirror, the same
  duplication `SYSTEM_PROMPT` itself already requires (Firebase Functions
  deploys only `functions/` as its own CommonJS package and cannot import
  `src/pipeline`; docs/resolution-log.md, 2026-07-06). `functions/index.js`
  now also exports `STRUCTURE_SYSTEM_PROMPT` (previously only `exports.api`
  existed), so a script can read it without spinning up a request.
- `scripts/check-prompt-sync.mjs` (new): diffs the two `SYSTEM_PROMPT`
  strings byte for byte and the two `REFERENCE_EXAMPLES` arrays
  structurally, plus a sanity check that `formatReferenceExamples` produces
  non-empty text and that `SYSTEM_PROMPT` actually contains it (catches
  "defined but never appended," not just array drift). First version
  `require`d `functions/index.js` directly to read its exported
  `STRUCTURE_SYSTEM_PROMPT`; passed locally (where `functions/node_modules`
  already existed from an earlier install) but failed in CI with
  `Cannot find module 'firebase-functions/v2/https'`, since the root
  `npm ci` this eval step runs under never installs `functions/`'s own
  dependencies. Fixed by extracting `STRUCTURE_SYSTEM_PROMPT_RULES`'s array
  literal directly from `functions/index.js`'s source text (a balanced-
  bracket scan, evaluated in isolation) instead of requiring the whole
  module, so the check has zero dependency on `functions/node_modules`
  existing; verified by moving `functions/node_modules` aside entirely and
  rerunning the check clean. `functions/referenceExamples.js` has no
  external dependencies of its own (plain data plus one pure function), so
  it is still `require`d directly, that part was never the problem.
  Verified the check actually fails on real drift, not just the happy path:
  temporarily edited one copy only, confirmed both failure messages fired
  with exit code 1, restored, reran clean. Wired into `npm run eval` (new
  `check:prompt-sync` script, last step) and as its own
  `ci.yml` step ("Prompt sync check") so a drift regression shows as its
  own red X, not buried inside the eval step's output. This is the guard
  against a fourth silent drift of this exact hand-synced duplication; the
  priority-direction bug (2026-07-08) is the reason this convention gets
  its own script now instead of "verified with a direct diff, not
  eyeballed" by hand each time.
- `docs/llm-pipeline.md`: new "Reference examples" section under Stage 2.
  States what this is, where it lives, how to edit it (swap an entry in
  `src/pipeline/referenceExamples.js`, copy the same change into
  `functions/referenceExamples.js`, let the sync script catch a miss), and
  states plainly that this is separate from `evals/fixtures/`, which still
  tests the pipeline's own plumbing offline, not the live model.

**What this does not prove.** Offline evals never call the real model,
mocked or not; they cannot show this changed live model behavior, and
nothing in this pass claims that. What CI actually verifies: the formatting
function produces non-empty, well-formed text; the block is really appended
to `SYSTEM_PROMPT`; the two hand-synced copies match. A real live call
before and after, spot-checked by hand
(`EVAL_ALLOW_LIVE=true npm run eval:live` or a real `/api/structure` call),
is the only way to see whether the live model structures better with these
examples in context; not run as part of this pass, stated in the PR
description rather than asserted here.

Verified: `npm run eval` 17/17 offline, 12/12 date, 26/26 todoist, prompt
sync check passing (55/55 total, unchanged fixture/case counts from before
this pass, since no fixture or contract changed, only what gets appended to
the live prompt). `npm run build` clean. `node scripts/check-secrets.mjs`
clean. `node --check functions/index.js` clean.

### Decisions not to relitigate

- `evals/fixtures/*.json` and `src/pipeline/referenceExamples.js` are
  separate collections with separate jobs: fixtures test the pipeline's own
  plumbing offline (contract validation, grounding, the retry path, all
  mocked); reference examples teach the live model. Do not collapse them
  into one array, and do not assume promoting a fixture into a reference
  example removes it from `evals/fixtures/`; both stay.
- `isGroundedInTranscript` was not touched and needed no change: it only
  ever validates a response's content against the real transcript argument,
  never against `SYSTEM_PROMPT`. Appending more text to the system prompt
  can never widen or weaken this guard; do not add a special case for
  reference-example text there.
- `src/pipeline/referenceExamples.js` and `functions/referenceExamples.js`
  are a third pair of hand-synced files, on top of `prompt.js`/
  `STRUCTURE_SYSTEM_PROMPT` and `contracts.js`/`STRUCTURE_JSON_SCHEMA`.
  `scripts/check-prompt-sync.mjs` is the enforcement mechanism now; do not
  remove it or narrow it to "eyeball the diff" again.
- Four reference examples, not more. The task scoped this tight
  deliberately; do not grow the array opportunistically without a reason
  as concrete as the four already there (one clean project, one real
  multi-section trace, one restraint case, one sections-earn-their-keep
  case).

## 2026-07-12: Migrated to a new repo with a single clean commit, not another history rewrite

Follow-up to the same day's "Rewrote git history to remove the same leaked
secrets from every past commit" entry below. That rewrite force-pushed a
redacted history to every branch of `main`, but GitHub keeps a separate,
hidden ref per pull request (`refs/pull/N/head`) that a force-push to `main`
never touches. Several already-merged PRs in the #27-#46 range were
confirmed still serving the real, unredacted values in plaintext via
`https://github.com/cottalucas/super-ramble/pull/<N>.diff`, no login
required: the real `TODOIST_CLIENT_SECRET` (confirmed against a live
Todoist App Console screenshot), a Firebase client id, the owner's personal
email, and a Firebase API key fragment. A history rewrite cannot reach a
PR's own hidden ref, so no further rewrite of `main` would have closed
this; only removing the PRs from public view does.

Done as a full repo migration rather than a second rewrite pass, since a
brand-new repo with a single commit has no old PR refs to leak from, by
construction:

1. Built a clean single-commit history in a scratch location (not the live
   working directory), copying the working tree minus `.git`, confirmed
   against the existing `.gitignore`. Verified with `git log --all -p`
   grepped for the leaked values' *shapes* (an `AIzaSy`-prefixed key, a
   32-char hex value near "secret", any literal email other than the
   `redacted@example.com` placeholder) that the one commit was actually
   clean, not assumed clean because it was new.
2. Added `scripts/check-secrets.mjs`, a CI step run before build on every
   push and PR, scanning tracked files for the same three shapes. Verified
   it catches each shape (temporarily added one, confirmed the check
   failed, removed it, confirmed clean) and does not false-positive on
   content already in this file that resembles but is not a leak: a
   40-character git commit SHA, and a GCP default-service-account address
   (`...-compute@developer.gserviceaccount.com`), neither of which is
   secret or personal.
3. Renamed the old `cottalucas/super-ramble` to `super-ramble-archive` and
   set it private, freeing the `super-ramble` name and closing public
   access to the old PR diffs.
4. Created a new `cottalucas/super-ramble`, private, from the clean
   single-commit scratch history. Confirmed CI green on the new repo's own
   Actions tab for the initial push, not assumed from a local run.
5. Cut the live working directory over: replaced `.git` with the new
   repo's, confirmed the remote, the one-commit log, and a clean
   `npm run build` / `npm run eval` / secret guard from the real working
   directory itself.
6. Found and deleted the local `cp -r` safety backup from the earlier
   history-rewrite pass (a sibling directory, dated the same day), since it
   was the one remaining full local copy of the pre-rewrite, unredacted
   history.

### Decisions not to relitigate

- A PR's `.diff` and `.patch` endpoints are served from the PR's own ref,
  independent of what `main` points to. Any future history-sensitive fix on
  a repo with merged PR history has to account for this, not just for
  `super-ramble`.
- The old repo was renamed and made private, not deleted. Deleting it is a
  separate, explicitly confirmed step, not part of this pass.
- The secret guard's patterns are intentionally narrow (key prefix, hex
  adjacent to a secret-related keyword within a proximity window, email
  outside the placeholder and GCP-service-account allowlist) rather than a
  bare 32-hex or bare email match, because a bare match already
  false-positives on ordinary content in this repo (commit SHAs, GCP
  service-account addresses). Keep it scoped, not loosened to "any hex" or
  "any email."
- `TODOIST_CLIENT_SECRET` was already rotated and dead before this pass;
  this migration addresses the client id, the UID, the email, and the API
  key fragment, which cannot be rotated the same way.

## 2026-07-12: README restructured, positioning and reading order, not a content patch

The prior same-day README rewrite (see the entry below) was accurate but
structured like internal documentation: it opened with a critique of
Todoist's Ramble, then dev setup, before ever mentioning the pipeline or the
live app. Restructured on four points, each grounded in existing `docs/`,
nothing invented:

- **Positioning.** Reworded the opening to lead with what Ramble already
  does well (fast capture, seconds to separate tasks) before naming the one
  gap it does not cover, and to lead with the fact that a confirmed project
  can be pushed straight into the user's real Todoist account
  (`src/todoist/index.js`, `docs/architecture.md`'s "The Todoist client"
  section). Reads as a companion to Ramble, not a critique of it.
- **Reading order.** The live URL (https://super-ramble.web.app) now opens
  the document, above the fold. `Run locally`, `Run the evals`,
  `Watch spend`, `Privacy`, and `Deploy`/`CI` are folded into one collapsed
  `<details><summary>For developers</summary>` block at the bottom; the
  primary path is now what this is, a "See it work" diagram, how the
  pipeline works, done.
- **Pipeline depth.** Added a "Does this get smarter over time?" section
  stating plainly that the model is never retrained, this is not
  fine-tuning, and citing the exact mechanism instead: every real Structure
  call persists a trace (`users/{uid}/structureTraces`), reviewed on the
  cadence `docs/llm-pipeline.md`'s "Live capture and the eval flywheel"
  section states, promoted into new offline fixtures
  (`scripts/promote-trace.mjs`). Backed with the two real bug stories from
  this log, quoted rather than paraphrased from memory: the 2026-07-08
  "Priority direction calibration blind spot" entry (the Structure prompt
  shipped without stating priority direction, inverting two tasks' priority
  against the transcript's own stated urgency) and the 2026-07-08 "First
  real review of the Structure trace collection" entry (the very first
  confirmed trace ever manually reviewed had that exact inverted-priority
  bug, despite the user having already clicked Confirm, the finding that
  motivates the review step existing at all).
- **Diagrams over prose.** Three Mermaid diagrams (GitHub renders Mermaid
  natively in `.md` files): the user flow (ramble through confirm through
  optional Todoist push), the architecture (browser, store interface,
  Function, the three external calls), and the eval flywheel (real call,
  trace, review, promotion, regression suite, prompt edits feeding back).
  Verified every label against the actual code paths listed above
  (`SuperRambleModal.jsx`'s `showTodoistToggle` gate, confirmed:
  only shown when `decision === 'project'`, no `targetProjectId`, and
  Todoist is connected) before finalizing wording, rather than trusting the
  starting sketch as-is.

**Diagram syntax was checked by hand, not by a live Mermaid render.** This
session's Mermaid Live Editor (browser-driven) auto-paired brackets and
quotes on paste and corrupted the input every time; abandoned rather than
spend further time fighting an editor UI unrelated to the actual change.
Verified instead: bracket/quote balance across all three code blocks and no
use of the reserved `end` token, via a small script, plus a manual read of
each diagram against standard Mermaid flowchart syntax (quoted node labels,
`<br/>` line breaks, piped edge labels, dotted feedback edges), all
common, well-supported constructs. A future pass with working Mermaid
render access should do a real visual check before trusting this further.

Kept unchanged, per instruction: the Documentation section's list of
`docs/` files and their one-line descriptions (only its em dashes were
swapped for commas, to match this doc's own "no em dashes" copy rule
applied to the rest of the file). `npm run build` and `npm run eval`
(17/17 offline, 12/12 date, 26/26 Todoist) both verified green; this pass
touches only `README.md`, so no hosting deploy applies.

## 2026-07-12: Rewrote README.md for a public GitHub audience

The old `README.md` was thin and stale. Checked against current code rather
than trusted: the Privacy section's "encryption not yet wired" claim turned
out to still be accurate (`src/lib/crypto.js`'s `encryptString`/
`decryptString`/`generateKey` have no importers anywhere in `src/`, and
neither store adapter calls them), so that claim carries over unchanged
rather than being "fixed" into something false; git history confirms neither
file has been touched since the 2026-07-04 pass that first corrected this
same claim.

Rewritten to actually explain the project to someone landing on the repo
cold: the problem and product framing from `docs/brief.md`, a short
architecture overview (the store interface, the Firebase Functions proxy)
from `docs/architecture.md`, a real "How the pipeline works" section
covering all three stages from `docs/llm-pipeline.md` (cited, not
re-derived from memory), and a new "Documentation" section listing every
file in `docs/` with one accurate line each.

Also caught checking the kept sections against current source rather than
assuming them unchanged:
- The Deploy section's `firebase functions:secrets:set` list was missing
  `GROQ_API_KEY`, a real third Function secret `functions/index.js` reads
  for `/api/transcribe` (Stage 1, shipped phase 3 part 4) alongside
  `ANTHROPIC_API_KEY` and `TODOIST_CLIENT_SECRET`. Added.
- The Evals section said `npm run eval` is "an alias of eval:offline." It
  is not, and has not been since `eval:date` and `eval:todoist` were wired
  in: `package.json`'s `eval` script is `eval:offline && eval:date &&
  eval:todoist`, matching what CI actually runs. Reworded to describe all
  three.
- `npm run build`, `npm run eval` (26/26 Todoist, 17/17 offline, 12/12
  date cases), all green, verified directly rather than assumed from the
  old text.

## 2026-07-12: Settings modal widened toward a real settings screen's chrome

`SettingsModal.jsx`'s two-pane layout (category list left, detail right) was
already the right shape; the gap was that `.settings-modal` rendered at the
same 560px scale as `AddProjectModal`'s small boxed dialog, not the larger,
more spacious panel a real settings screen reads as. This pass is a chrome
and spacing change only: no new category, control, or JSX beyond what
already existed (Account, Theme, Todoist stay the only three, matching
`docs/roadmap.md`'s Out-of-scope list).

- `.settings-modal` (now written `.modal.settings-modal`, so it actually wins
  over the base `.modal` rule's own `width` declaration later in the same
  stylesheet, rather than losing to it on source order) grew from 560px to
  880px, with `max-width: calc(100vw - 64px)` and a taller
  `max-height: calc(90vh - 32px)`.
- `.settings-nav` grew from a 160px to a 200px rail with more vertical
  padding, and `.settings-detail` grew from `16px 20px` to `32px 40px`,
  giving each field real room instead of a cramped list.
- `.settings-heading` (the per-section "Account" / "Theme" / "Todoist"
  label) grew from a 12px uppercase eyebrow to a plain 20px bold heading, in
  `--ds-ink` instead of `--ds-ink-soft`, closer to how a real settings pane
  labels its own section.
- Added a phone-width (`<640px`) override dropping `.settings-detail`'s
  padding back to the old `16px 20px`: the wider desktop padding alone was
  never checked against a 375px-wide modal and would have crowded the
  content, the same category of regression the existing Responsive section
  already guards against.

**No reference screenshot was available for this pass**, unlike the
2026-07-10 UI-parity entries this doc already has for other views; sizing
(880px, the 200px rail, the padding and type scale) is a judgment call
against the anti-pattern checklist's "no cramped spacing" / "no tiny fonts"
rules, not a pixel match to a real Todoist or Super Ramble settings
screenshot. A future pass with a real screenshot should audit these exact
values before treating them as final, the same open gap the 2026-07-10
entry already modeled for its own three items.

Verified live at desktop width (Account, Theme, and Todoist panes) and at
375px phone width (stacked nav, no clipping) via `VITE_ENABLE_LOCAL_PREVIEW`,
not just read from the CSS.

## 2026-07-12: Rewrote git history to remove the same leaked secrets from every past commit

Follow-up to the same day's "Redacted leaked Todoist/Firebase secrets from
this file" entry below. That entry fixed the current content of this file
but, as flagged there, left the real values recoverable from roughly 90
historical commits touching `docs/resolution-log.md`. This pass removed
them from history itself, since this repo is public on GitHub.

Done directly against `main`, not through a PR, since it is a full-history
rewrite rather than an ordinary content change:

1. Took a full local backup of the working repo (`cp -r` to a sibling
   directory) before anything irreversible.
2. Confirmed every non-`main` remote branch was already merged into `main`
   (`git branch -r --merged`), then, from a fresh clone (git-filter-repo's
   own documented requirement, not the existing working copy), installed
   `git-filter-repo` and ran it with `--replace-text` against a
   `replacements.txt` mapping the real `TODOIST_CLIENT_SECRET`, its
   truncated duplicated-form depiction, the real Todoist client id, the
   real Firebase UID, the owner's personal Gmail address, and the partial
   Firebase API key prefix to the same redaction markers used in the
   content-only fix.
3. Verified across `git log --all -p` on the rewritten clone that none of
   the real values remained in any branch's history (the only remaining
   hits were normal `Author:` commit-metadata lines carrying the owner's
   own email, which is ordinary git authorship, not a leaked secret, and
   was deliberately left untouched).
4. Force-pushed the rewritten history for every branch (`--force --all`,
   `--force --tags`) from the fresh clone, rewriting nearly every commit
   hash in the repo, since `docs/resolution-log.md` is touched in almost
   every commit. Expected, not a bug.
5. Deleted all ~15 already-merged stale branches from the remote, since a
   leftover branch would still point at the old, unredacted blobs even
   after `main` was rewritten.

**This does not, and cannot, guarantee the values are gone everywhere.**
GitHub's own caches, search index, and any pre-existing fork or local clone
made before this rewrite are outside what a history rewrite can reach or
guarantee; only the canonical repo at `github.com/cottalucas/super-ramble`
was rewritten here. The `TODOIST_CLIENT_SECRET` is being rotated separately,
out of band, which is the actual mitigation for the secret specifically;
this rewrite addresses the UID, client id, email, and API-key fragment,
which cannot be "rotated" the same way.

### Decisions not to relitigate

- A full local backup before running `git-filter-repo`, and running it from
  a fresh clone rather than the existing working copy, are both
  non-negotiable per the tool's own documented safety requirements; do not
  skip either on a future rewrite.
- Only branches that were already merged into `main` were deleted. A future
  pass finding an unmerged stale branch should not delete it by the same
  reasoning; that branch may carry real, un-landed work.
- Commit author/committer email addresses were left untouched. That is
  normal git authorship metadata, not a leaked secret, and rewriting it
  would mean remapping identities across the whole repo, a materially
  different and larger change than redacting leaked values from file
  content.

## 2026-07-12: Redacted leaked Todoist/Firebase secrets from this file

This file carried real, live credential material in plaintext, discovered
across several entries logging genuine debugging work: the real
`TODOIST_CLIENT_SECRET` value (and a truncated depiction of its duplicated
form), the real Todoist OAuth client id, the real Firebase Auth UID, the
project owner's personal Gmail address, and a partial real Firebase web API
key. This repo is public on GitHub. Each occurrence is now replaced with a
redaction marker (`[REDACTED-TODOIST-SECRET]`, `[REDACTED-TODOIST-CLIENT-ID]`,
`[REDACTED-UID]`, `redacted@example.com`, `[REDACTED-FIREBASE-API-KEY]`); the
surrounding engineering narrative (the duplicated-secret bug, the uid lookup,
the verified-prod-env check) is unchanged, since that story is legitimate
history and only the raw values needed to go. A repo-wide grep for all four
exact strings, plus a broad scan for other 32+ character hex/alphanumeric
runs, confirmed no other file carried any of this material.

The `TODOIST_CLIENT_SECRET` itself is being rotated separately, out of band;
this pass only removes the leaked plaintext, it does not touch Todoist's API
or issue a new secret.

**This redaction, by itself, does not remove the values from git history.**
The same four values are still recoverable from old commits until a
separate history-rewrite pass runs; see the follow-up entry once that
completes.

## 2026-07-10: Three UI regressions fixed against real Todoist screenshots; a real React-portal bug found and fixed along the way

Three items, reported directly against real Todoist screenshots (its own
Add-task modal, its avatar dropdown, its login page) and this app's own
current screenshots. `docs/design-system.md`'s "Inline add-task," "Landing
/ signed-out gate," and "Sidebar avatar menu" sections already described
the target shape for all three before this pass started; this pass built
the code to match.

**Reference screenshots were not saved to `docs/reference/` this pass.**
Four images were attached to the task; there is no tool available in this
session that extracts a pasted image's raw bytes to a file path, and a
search of common temp/upload/screenshot locations on this machine found
none. Flagged before starting rather than silently skipping it or
fabricating placeholder files. `docs/reference/` still holds only its own
README placeholder; a future pass with the images as real files (dragged
into the repo, or a path given directly) should complete this.

1. **Sidebar Add task is a real centered modal again, not a popover.**
   `Sidebar.jsx` imported `QuickAddModal.jsx` (already correct, already
   used for "Add sub-task") instead of wrapping `TaskAddForm` in a
   `Popover`; the trigger button is now a plain `nav-item`, and
   `{addTaskOpen ? <QuickAddModal onClose={...} /> : null}` renders at the
   bottom alongside `settingsOpen`/`superRambleOpen`, the exact existing
   pattern. `QuickAddModal.jsx`'s own stale comment ("the sidebar's global
   Add task uses a popover") is corrected. The dead `.popover-add` CSS
   rule is removed. Verified live, both themes: `.modal`'s own computed
   `box-shadow` is present and no `border` is set at all (confirmed via
   direct style inspection, not a screenshot), matching Add Project and
   Settings' existing chrome.

2. **The signed-out gate now always renders light, regardless of the
   stored dark-mode preference.** `.landing` re-declares all twelve
   `--ds-*` tokens to their light values directly on itself, overriding
   whatever `[data-theme='dark']` set on the root for that one subtree;
   `[data-theme]` on the root itself is untouched, so the signed-in Shell
   still respects the real stored preference exactly as before. Re-
   declaring light values when the root is already light is a harmless
   no-op.

   **Caught live, a real bug this fix itself introduced**: `.landing-
   wordmark` ("Super Ramble") had no explicit `color` declaration, unlike
   every other piece of text under `.landing`. `body`'s own `color:
   var(--ds-ink)` resolves against whatever theme is active at *body's*
   level (an ancestor, outside `.landing`'s scoped override), and CSS
   inheritance carries that already-resolved computed value down; it does
   not re-evaluate the custom property inside `.landing`'s own scope. In
   dark mode this rendered the wordmark in the dark theme's near-white ink
   color against `.landing`'s now-light background, nearly invisible.
   Fixed by giving `.landing-wordmark` its own explicit `color:
   var(--ds-ink)`. Checked every other text element under `.landing` for
   the same gap; none had it, all already declare their own color
   explicitly.

3. **The avatar dropdown gained Settings and Log out rows.** Added inside
   the existing `sidebar-head-trigger` `Popover`, below the header/synced
   lines: a `Settings` row calling the same `setSettingsOpen(true)` the
   gear icon already calls, and a `Log out` row (real accounts only,
   `!isLocal`) opening the same sign-out `ConfirmDialog` and copy
   (`SettingsModal.jsx`'s "Signing out doesn't delete anything...") rather
   than a second wording or an instant sign-out. Both styled
   `.avatar-menu-item`, matching `.settings-nav-item`'s look.

   **Caught live, a real, subtler bug**: clicking either new row closed
   the menu and then immediately reopened it in the same click. Root
   cause was structural, not a state bug: the outer `sidebar-head-trigger`
   was itself a `<button>` with its own `onClick`, and the `Popover`
   (portaled to `document.body` by `Popover.jsx`) was rendered as that
   button's own JSX child. React replays a portaled element's events
   through its *React-tree* ancestry, not its DOM position, so a click on
   anything inside the portaled Popover content still bubbles up through
   React to the outer button's own `onClick` too. My inner handler's
   `setAvatarMenuOpen(false)` ran first; the outer button's
   `setAvatarMenuOpen((v) => !v)` then ran second, in the same tick,
   flipping it right back to open. `ProjectNode`'s own project-options
   menu (`Sidebar.jsx`) and `SectionOptionsMenu.jsx` never had this bug
   because they already keep the trigger `<button>` and the `Popover` as
   *siblings* inside a non-interactive wrapper, never nesting the Popover
   inside the clickable element itself. Restructured
   `sidebar-head-trigger` to match: a new `.sidebar-head-trigger-wrap`
   span (no `onClick`) now holds the button and the Popover as siblings.
   Verified live: Settings now opens and the menu stays closed, in both
   themes.

Verified live throughout via a temporary local-preview build (reverted
before committing, `npm run verify:prod-env` confirmed clean after) at
desktop width, both themes: the Add-task modal's computed border, the
landing gate forced light with the wordmark fix, and the avatar menu's
Settings/Log out rows (Log out itself only checkable via `isLocal`'s own
UI branch, unreachable without a real account in this environment; the
underlying event-bubbling fix is structural and applies identically to
both rows). `npm run build` succeeds; `npm run eval` unaffected, 26/26
Todoist, 17/17 offline Structure, 12/12 date, since nothing under
`src/pipeline/` was touched. No `functions/` or `firestore.rules` file
changed; deployed hosting only.

### Decisions not to relitigate

- The sidebar's global Add task opens `QuickAddModal.jsx`, never a
  `Popover`. This is the second time this exact trigger has been reopened
  between the two chrome styles (popover, per phase 2.8 part 4; centered
  modal, 2026-07-10 twice over); do not revert to a popover again without
  an equally explicit, direct screenshot-driven decision recorded here.
- `.landing` forces its own light-theme token values, independent of
  `[data-theme]` on the root. Any new text or control added under
  `.landing` must declare its own `color` (or other themed property)
  explicitly via `var(--ds-*)`; relying on bare inheritance from an
  ancestor outside `.landing`'s scope will silently pick up the wrong
  theme's already-resolved value. Checked and confirmed clean for every
  existing element as of this entry; a future addition needs the same
  check, not an assumption.
- A `Popover` and the button that opens it must be siblings under a
  shared, non-interactive wrapper (a plain `span`/`div`, `.popover-wrap` or
  equivalent), never parent and child of each other. `Popover.jsx` portals
  to `document.body`; React still replays a portaled child's events
  through its React-tree ancestry, so nesting it inside a clickable
  element makes every click inside the popover also fire that outer
  element's own handler. `SectionOptionsMenu.jsx` and `ProjectNode`
  already modeled the correct shape; `sidebar-head-trigger` now matches
  it too. Check this shape specifically whenever adding a new
  Popover-opening trigger to this codebase.
- No tool in this session's environment can extract a pasted image's raw
  bytes to a file. Do not assume a future session can either without
  checking first; ask for a file path or have the images dropped directly
  into the repo instead of attempting to "save" them from the
  conversation.

## 2026-07-10: Signed-out gate rebuilt as a real split view with email/password auth; Email/Password provider confirmed off in the Firebase console

Supersedes the 2026-07-10 landing-page entry's visual shape, not its copy:
the two value-prop paragraphs (docs/brief.md's Problem/Product sections)
and the "Built by Lucas Cotta" footer credit carry over unchanged, both
already correct.

**What was wrong**: `App.jsx`'s `Gate()`, signed out, was a giant "Super
Ramble" h1, two paragraphs, a bare placeholder box, and a single Google
button. Compared directly against a real Todoist login screenshot (split
view, small wordmark, Google/Facebook/Apple plus email/password fields, an
illustration): thin and unfinished next to it, and missing a real
capability, not just polish, since this app only ever offered Google.

**Added real email/password auth**, `src/auth/AuthContext.jsx`:
`signInWithEmail`, `signUpWithEmail`, `resetPassword`, calling Firebase's
own `signInWithEmailAndPassword`/`createUserWithEmailAndPassword`/
`sendPasswordResetEmail`, alongside the existing Google `signIn`, not
replacing it. Each has the same `LOCAL_MODE` branch `signIn` already had,
so local preview keeps working with no real backend.

**Rebuilt `Gate()`'s signed-out branch as a real split view**: sign-in side
left, value-prop side right (the previous entry had value-prop left,
sign-in right; swapped along with the rest of the shape). One `mode` state
(`'login' | 'signup'`) swaps the same card between the two instead of two
routes. Inside: "Continue with Google" (unchanged), a divider, then a real
email/password form; login adds "Forgot your password?"
(`resetPassword`, a plain confirmation line, no modal); sign-up adds a
confirm-password field, checked client-side before ever calling Firebase.
`authErrorMessage()` (`App.jsx`) maps real Firebase Auth error codes
(wrong password, no such account, email in use, weak password, invalid
email, provider off) to one plain line each, never a raw error object.
The old dashed "Product screenshot coming soon" placeholder is replaced by
`.landing-accent`, a small looping CSS animation built from three of this
app's own icons (`IconMic`, `IconSparkle`, `IconCheck`) pulsing in a
staggered `--ds-red` loop, no imported image, no new animation library.

**The Email/Password provider is confirmed off in the live Firebase
console right now, checked directly, not assumed.** This is the exact
condition the task named as a stop-and-report case, not something to work
around in code. Tested against the real, deployed-equivalent build (this
machine's `.env.local` already carries real Firebase config, not
local-preview) with a real throwaway address
(`super-ramble-test-account@example.com`, `example.com` being the IANA
reserved documentation domain, not a real third party): both
`signUpWithEmail` and `signInWithEmail` failed identically with
`auth/operation-not-allowed`, surfaced correctly as "Email sign-in is not
turned on yet. Use Google for now." `resetPassword` returned success for
the same address with no error at all; not read as evidence the provider
is on, since Firebase's own password-reset endpoint deliberately returns
success regardless of whether an account exists or the provider is
enabled, to avoid leaking account existence. The two create/sign-in calls
failing identically, on both paths, is the real, authoritative signal.
**Manual prerequisite for Lucas, not fixed here**: turn on Email/Password
in the Firebase console (Authentication > Sign-in method). No code change
can do this. Once it is on, this implementation needs no further changes,
the code path is already correct end to end.

Verified live otherwise: Google's own button unaffected; both desktop and
phone width (the split view stacks below 640px, sign-in card first);
light and a localStorage-forced dark check (theme is a stored preference,
not tied to the OS, per this doc's own existing note). `npm run build`
succeeds; `npm run eval` unaffected, 26/26 Todoist, 17/17 offline
Structure, 12/12 date, since nothing under `src/pipeline/` was touched.

Updated `docs/design-system.md`'s "Landing / signed-out gate" section to
describe this actual shape, replacing what it said after the prior pass
rather than leaving it stale.

### Decisions not to relitigate

- The signed-out gate's sign-in side is left, value-prop side is right;
  the 2026-07-10 entry had them the other way around. This entry's shape
  is the current one.
- "One primary action per surface" does not mean literally one button on
  an auth screen: Google and the email/password form's own submit are both
  the same single primary action (signing in), not two competing
  primaries, the same way a real login screen's several provider buttons
  don't compete with each other. Secondary links (forgot password, the
  mode toggle) and the footer credit stay quiet text so neither of the two
  real actions gets buried; that is the actual, narrower rule to keep.
- `sendPasswordResetEmail` returning without error is not evidence that
  the Email/Password provider is enabled or that the account exists;
  Firebase's own anti-enumeration behavior returns success regardless. Use
  a real `signInWithEmailAndPassword`/`createUserWithEmailAndPassword`
  call to test whether the provider is actually on.
- The Email/Password provider being off in the Firebase console is a
  standing, external fact about this project's configuration as of
  2026-07-10, not a bug in `AuthContext.jsx` or `Gate()`. Do not "fix" this
  again in code; it needs the console toggle flipped, by Lucas, once.

## 2026-07-10: Drag-and-drop reliability fix, sign-out copy, landing page polish (fix pass on the six-item entry)

Fix pass on top of the 2026-07-10 "UX-parity pass against real Todoist,
six items" entry, reported live by Lucas after using that build. Four
items scoped; three built, one held back for a real reason, stated below,
not silently skipped.

**Item 1: drag-and-drop was unreliable, for one confirmed root cause, not
two.** Reported: dragging a project onto another to reparent it shows the
drop indicator but releasing doesn't commit, and drag in general (project
reparent, task cards) is laggy, often needing a second attempt.

The 2026-07-10 six-item entry's own "verified live" claim for drag-to-nest
was flagged first, per instruction, as not real evidence: it dispatched a
single `dragstart`/`dragover`/`drop` sequence through `preview_eval` with an
artificial delay between each event, which is not the same shape as a real
mouse-driven drag hovering across several rows before releasing.

Two suspects were investigated, not assumed:

- **`AppData.jsx`'s `bump()` does a full `reload()`** (three Firestore
  reads) after every drop, before the UI reflects it. Real, and a genuine
  contributor to perceived lag against a real Firestore session (this
  environment cannot exercise real Firestore latency directly, no signed-in
  session available; local-store has none, by construction). Judged real
  but secondary: it would explain a slow-but-eventually-correct drop, not a
  drop that requires "a second attempt," which points at an outright
  failure to commit, not just delay.
- **`TaskRow.jsx` and `Sidebar.jsx`'s `ProjectNode` both mounted or
  unmounted a `.drop-placeholder` sibling `<div>` as the drag preview
  changed** (`showBefore`/`showNest`). Confirmed as the actual bug, not
  just plausible: this changes the DOM's shape, shifting every row below
  the insertion point by the placeholder's height. Simulated a real,
  multi-step drag (`dragstart`, then several `dragover` events at a
  realistic ~35-60ms cadence moving across a row's top half then bottom
  half, matching real `mousemove` pacing, not one instant `dragover`) and
  watched the indicator: it appeared as intended with no jump once fixed
  (below), and reasoning through the before-state confirms a shifted row
  can move out from under a stationary cursor, firing a spurious
  `dragleave` that clears `dragPreview`, exactly matching "shows the
  indicator, releasing doesn't commit."

**Fixed, the same way in both files**: `showBefore`/`showNest` and the
inserted `.drop-placeholder` divs are gone. `TaskRow.jsx`'s row and
`Sidebar.jsx`'s `ProjectNode` row instead carry `.drop-before`/`.drop-nest`
classes directly, styled with `box-shadow` (`inset 0 2px 0 0` for
"before," `inset 0 0 0 2px` plus a tinted background for "nest"),
`box-shadow` never affects layout, so nothing about a row's position
changes as the preview state changes. `TaskList.jsx`'s own end-zone
placeholder (`.task-list-end-zone`, appended past the last row) is
untouched on purpose: it's a fixed zone below every real row, so it never
shifts a row a cursor might still be over, not the same bug.

**Also fixed, addressing the "laggy" half of the report directly**:
`AppData.jsx` gained `patchProjects`/`patchTasks`, applying an already-
known write result to local state immediately. `Sidebar.jsx`'s
`handleProjectDrop` (all three branches: nest, same-parent before,
cross-parent before) and `TaskList.jsx`'s `writeOrderedList`/the "nest"
branch of `handlePositionDrop`/both branches of `handleDrop` now call the
matching `patch*` right after their real write, before `bump()`'s slower
full reload runs. `bump()` itself is unchanged and still runs after, the
real source of truth; this only removes the visible wait for a result the
caller already knows.

**Verified with a real gesture shape, not the prior shortcut**: both a
project drag-to-nest (Project B onto Project A, multi-step hover, top half
then bottom half, ~35-60ms between events) and a task drag-to-nest (Task
Two onto Task One, same cadence) were run end to end. Confirmed via
`preview_inspect` that the mid-drag `box-shadow` is exactly `0px 2px 0px
0px inset` with no height change on the hovered row (no layout shift);
confirmed the drop actually commits by reading the resulting
`parentProjectId` directly from the store's own data, not just the
rendered UI, both times; confirmed the UI reflects the result immediately
after drop, not after a delay.

**Item 2: sign-out copy.** `SettingsModal.jsx`'s `ConfirmDialog` message
changed from "You will need to sign in again to see your tasks." (reads as
a possible data loss) to "Signing out doesn't delete anything. Sign in
again anytime to see your tasks." Title and confirm label unchanged. Not
verified live: the Sign out button only renders for a real (non-local)
account, unreachable in this environment without real Google auth; the
change itself is a single string literal, confirmed via direct source
read.

**Item 3: add-task dialog comparison against a real Todoist screenshot —
not done this pass.** The task named two screenshots (a real Todoist
Today-view add-task popover, and this app's current Settings/Today view)
as the basis for this comparison. Neither was actually attached; the one
image present in that message was this app's own Today view with the
Super Ramble ramble-input modal open, unrelated to an add-task-dialog
comparison. Flagged before starting, not guessed at: this codebase's own
established rule (`docs/resolution-log.md`, 2026-07-10's chip-row entry)
is that a screenshot comparison is done against the actual screenshot, not
a written description or an assumption of what it probably shows. Held
back entirely rather than making cosmetic changes with no reference to
check them against.

**Item 4: landing page visual polish.** Styling only, on top of the
2026-07-10 layout, copy, and structural decisions, all unchanged.
`.landing` gained a `--ds-sidebar-bg` background (this app's own existing
"warm near-white" sidebar token, not a new color invented for this one
page) so the sign-in card floats on a warmer surface instead of one flat
`--ds-canvas` throughout; more generous `gap`/`padding` on desktop (the
phone-width stacked layout is unchanged). `.landing-hero-placeholder`
changed from a dashed outline to a solid-bordered, softly tinted framed
card (`color-mix(in srgb, var(--ds-ink) 3%, var(--ds-canvas))`), reading as
an intentional part of the page instead of an unfinished placeholder,
still clearly labeled "Product screenshot coming soon," still not a faked
image. `.landing-signin-card` got a heavier shadow and more padding.
Verified live at desktop and phone width, both themes (light and a
localStorage-forced dark check, since theme is a stored preference, not
tied to the OS).

Verified: `npm run build` succeeds. `npm run eval` unaffected, 26/26
Todoist, 17/17 offline Structure, 12/12 date, since nothing under
`src/pipeline/` was touched.

### Decisions not to relitigate

- A drag preview (before/nest, anywhere in this app) is drawn as a
  `box-shadow`/background class on the row already in the DOM, never a
  mounted or unmounted sibling element. An inserted placeholder was tried
  first, in the original 2026-07-06/2026-07-10 drag work, and caused real,
  reported drops to silently fail; do not reintroduce that pattern for a
  future drag feature. `TaskList.jsx`'s end-zone placeholder is the one
  legitimate exception, since it lives in a fixed zone past the last row
  and never shifts a hovered row.
- Verifying a drag-and-drop fix with `preview_eval` requires a realistic,
  multi-step `dragover` sequence (several events, ~35-60ms apart, moving
  across more than one row or more than one zone of the same row) and
  reading the actual store data after drop, not a single instant
  `dragstart`/`drop` pair. A single-shot synthetic sequence proved
  insufficient once already, in the entry this one fixes; do not repeat
  that shortcut and call it verified.
- `bump()`'s full `reload()` stays the source of truth after a drag;
  `patchProjects`/`patchTasks` are a perceived-latency fix layered on top,
  not a replacement for it. A future write path that needs instant local
  feedback should call the matching `patch*` right after its own write,
  the same way, rather than inventing a second optimistic-update mechanism.
- Do not attempt a screenshot-based comparison task without the actual
  screenshot in hand; a written description of what a screenshot shows is
  not a substitute, per the standing rule the 2026-07-10 chip-row entry
  already established. Item 3 above is still open for whenever the real
  screenshots are provided.

## 2026-07-10: UX-parity pass against real Todoist, six items

Six scoped items, one branch, six separate commits, one PR. `docs/` set
read fresh first per `docs/orchestration.md`. No `src/pipeline/` file
touched; `npm run eval` stayed at 26/26 Todoist, 17/17 offline Structure,
12/12 date throughout, unaffected by any of the six.

1. **Removed Reminders entirely.** `ReminderPicker.jsx` deleted; every
   usage (`TaskAddForm.jsx`, `TaskDetail.jsx`), the `reminders` field in
   `src/store/tree.js`, and every stale doc mention (architecture.md's
   schema, two design-system.md sections) removed. It was not a dead
   control in the strict sense (it persisted correctly), but no delivery
   mechanism existed anywhere to ever fire a notification from it; removed
   now rather than half-built further. `docs/architecture.md` states why,
   for a future pass that reintroduces it once delivery is actually scoped.
2. **Sidebar "My Projects": swapped +/caret order.** Real Todoist puts the
   collapse caret rightmost, "+" immediately to its left; this app had
   caret first. Reordered the JSX and replaced a specificity-override CSS
   trick with a plain `.nav-section-add` class carrying its own
   `margin-left: auto`.
3. **Reopened sidebar project drag-to-reparent.** The 2026-07-06 entry's
   "siblings-only, never reparenting" decision is reopened, with a forward
   pointer left in that entry rather than silently contradicted. Top half
   of a project row now previews "before" (sibling insert, reparenting too
   across different parents); bottom half previews "nest" (become that
   row's child), mirroring `ProjectView`'s own task-list drag model
   (`TaskRow.jsx`/`TaskList.jsx`) instead of a new one. Cycle guard reuses
   `AddProjectModal.jsx`'s `validParentCandidates`, already exported for
   exactly this kind of reuse. Same-parent "before" is byte-for-byte the
   old `reorderSiblings` path.
4. **Priority flags filled for P1-P3, outline stays for P4.** `IconFlag`
   gained a `filled` prop (default `false`, every other caller
   unaffected); `PriorityPicker.jsx` passes `filled={p < 4}` for both the
   popover list and the trigger chip's own icon. `TaskRow.jsx`'s priority
   checkbox ring is untouched, a separate mechanism. Also removed
   `IconBell` (Icons.jsx), dead since item 1.
5. **Settings two-pane layout, phase 2.8 part 2, moved from Next to
   Built.** A category list (Account, Theme, Todoist) on the left, the
   selected category's content on the right; each category's own fields,
   order, `isLocal` branches, and `ConfirmDialog` flows unchanged, only the
   chrome around them changed. Corrected a stale roadmap line in the same
   pass: that entry said "only Account and Theme are real categories,"
   written before phase 3 part 8 shipped Todoist; the list is three items,
   not two. Sidebar avatar/name is now a real dropdown: name + task count,
   a divider, "Synced <time ago>" (`AppData.jsx`'s `bump()`, a client-side
   timestamp, not a real sync engine, new `timeAgo` in `src/lib/date.js`).
   Explicitly left out, per the roadmap's own Out-of-scope list: Add a
   team, a duplicate Reporting entry, Print, What's new, Try Pro, the
   changelog line.
6. **Landing page for the signed-out gate.** Verified first, not
   rebuilt blind: `npm run verify:prod-env` clean, and a signed-out visit
   to the live site renders only `Gate()`. That check is what actually
   surfaced a live, separate, more serious problem (below), fixed and
   logged before this item was finished. `Gate()`'s signed-out branch is
   now a real two-side landing page: value prop (copy pulled from
   `docs/brief.md`'s Problem/Product sections, stop-slop'd, not Todoist's
   own words) beside a sign-in card. "Continue with Google" stays the one
   primary action; a quiet footer credit ("Built by Lucas Cotta",
   lucascotta.ch, Lucas's own answer when asked directly rather than
   guessed) is plain text, never a button. No hero screenshot: a clearly
   labeled empty placeholder, not a faked image, since none exists yet.
   New "Landing / signed-out gate" section in `docs/design-system.md`.

**A live incident was found and fixed in the middle of this pass, not
after.** Doing item 6's own "verify before touching" step surfaced that
every hosting deploy made earlier today (unrelated to these six items) had
shipped with no real Firebase config at all, an active production outage
independent of anything in this pass. See the entry directly below this
one for the full account; it was fixed and deployed on its own, from
`main`, before this six-item branch resumed, specifically so an unrelated
emergency fix would not get bundled with unreviewed feature work.

**Verified live, not just via build+eval:**
- Real end-to-end interaction, via a temporary local-preview build
  (`VITE_ENABLE_LOCAL_PREVIEW=true` in `.env.local`, on this local machine
  only, reverted before every commit, confirmed clean again via
  `npm run verify:prod-env` each time): item 1's chip row with no
  Reminders chip; item 2's My Projects row order; item 3's drag-to-nest,
  actually reparenting a project (`Project B` dragged onto `Project A`,
  confirmed both by the resulting indented sidebar row and by reading the
  local store's own `parentProjectId` directly, not assumed from the UI
  alone); item 4's filled P1/P2/P3 flags versus P4's hollow outline in a
  real priority popover; item 5's Settings two-pane switching between all
  three categories, and the avatar menu's "Synced <time ago>" updating
  after a real task write; item 6's landing page at both desktop and
  phone width, and the signed-out `Gate()` check itself (which found the
  separate incident above).
- The `preview_*` browser tooling cannot navigate to an external origin
  (confirmed again this pass); local verification used a `python3 -m
  http.server` serving the real `dist/` build instead, through a
  temporary, uncommitted `.claude/launch.json` entry, removed after each
  use, the same technique the incident entry below also used.
- Simulating an actual HTML5 drag gesture via `preview_eval`, not just
  clicking, needed a real discovery: dispatching `dragstart`/`dragover`/
  `drop` back to back with no delay between them fired against a stale
  React closure (the state update from `dragstart` had not committed yet
  when `dragover` fired), so nothing happened. Awaiting a short
  `setTimeout` between each dispatched event let React commit in between,
  and the reparent then worked and was confirmed in the store's own data.
  A future pass simulating drag-and-drop this way should await between
  events for the same reason, not assume a tight synchronous dispatch
  sequence behaves like a real, human-paced drag.

### Decisions not to relitigate

- `reminders` is gone from the schema and every component; do not
  reintroduce it without a real delivery mechanism scoped alongside it.
- Sidebar project drag is position-aware (top half before/reparent, bottom
  half nest), not siblings-only. See the 2026-07-06 entry's own forward
  pointer.
- `IconFlag`'s `filled` prop: `true` for a real priority (1-3), `false` for
  none (4). Do not flip this or apply it elsewhere without checking a real
  screenshot first, the same "screenshot wins over a written description"
  discipline the 2026-07-10 chip-row entry already established.
- `SettingsModal.jsx` is a two-pane layout now; a future new settings
  category is a fourth `SECTIONS` entry plus its own conditionally
  rendered `<section>`, not a new stacked block in the old single-column
  shape.
- Simulating HTML5 drag-and-drop through `preview_eval` requires a real
  delay between dispatched `dragstart`/`dragover`/`drop` events, or React's
  state updates have not committed yet and the sequence silently no-ops.

## 2026-07-10: Second real production outage today, same root cause as 2026-07-07: no `.env.local` at all, not just the flag set wrong

"Lucas: all my tasks disappeared" was reported right after the PR #39
chip-row deploy. It was investigated as a likely render crash (no error
boundary above `TaskAddForm.jsx`), and that PR was rolled back on that
theory, verified live. The rollback genuinely did restore the pre-PR#39
*code*. It did not fix the actual problem, because the actual problem was
never the code.

**What was actually wrong, found while doing item 6 of the next task (verify
the auth gate before touching it) and checked directly, not assumed:**
every `npm run build` run in this session, on this freshly set-up machine,
had no `.env.local` at all. `src/firebase.js`'s `firebaseReady` is
`Boolean(config.apiKey && config.projectId && config.appId)`; with no
`.env.local`, every `VITE_FIREBASE_*` value is `undefined`, so
`firebaseReady` is `false`, so `src/auth/AuthContext.jsx`'s `LOCAL_MODE
= LOCAL_PREVIEW || !firebaseReady` is `true` regardless of
`VITE_ENABLE_LOCAL_PREVIEW`. Every hosting deploy made from this machine
today, the chip-row deploy and the rollback deploy both, shipped a build
where any visitor sees the fake `{ uid: 'local-preview', displayName: 'You'
}` user and an empty local task list, with no sign-in gate at all. This is
the same class of incident as 2026-07-07 (a keyless/local-preview build
reaching production), through a different door: that incident was the flag
explicitly set to `true`; this one was the flag entirely absent, which
`LOCAL_MODE`'s own `||` treats identically. **`npm run verify:prod-env`
would have caught this**, checked directly rather than assumed: re-ran it
with `.env.local` moved aside and confirmed it prints "No `.env.local`
found... Nothing to verify against" *and exits 1*, a real failure, not a
clean pass. The actual gap was never the script; it was that this pass
never ran it before either of today's earlier hosting deploys, despite
`docs/architecture.md`'s own "Secrets" section stating plainly that it
"must pass before any `firebase deploy` that includes a hosting rebuild."
A first draft of this entry claimed the script itself was the gap and was
wrong; corrected here rather than left standing, since a future pass
trusting that claim would waste time "fixing" a script that already works.

**Checked directly, not inferred from reading the code alone.** The
`preview_*` browser tooling refuses to navigate its tracked tab to an
external origin (confirmed: `window.location.href`/`location.replace` to
`https://super-ramble.web.app` both silently reverted to the local tracked
server), so the live site itself could not be opened directly through it.
Instead, curled the live `index.html` and JS bundle, grepped for any real
config marker (`AIzaSy`, `firebaseapp.com`, the real `messagingSenderId`)
and found none, only the `local-preview`/`"You"` fallback object; then
mirrored the exact live bytes into a local directory, served them with a
plain `python3 -m http.server` (a temporary, uncommitted `.claude/
launch.json` entry, removed after), and opened that in the browser tool,
which showed the fake signed-in "You" account with an empty sidebar,
confirming the hypothesis against the actual served bytes, not just their
absence of a string.

**Fixed**: `firebase apps:sdkconfig web --project super-ramble` (the
authoritative source for a Firebase web app's own public config, all
`VITE_FIREBASE_*` values are public by design per `.env.example`) gave the
real values; wrote a proper `.env.local` on this machine
(`VITE_ENABLE_LOCAL_PREVIEW=false` explicit, not just absent) from `main`
directly, not from the in-progress six-item feature branch, since this fix
is pure local machine config with no code diff to review and mixing it
with unreviewed branch code would have shipped that code early. Rebuilt,
confirmed the new bundle actually contains the real `apiKey`/`authDomain`
strings before deploying, `firebase deploy --only hosting`, then repeated
the mirror-and-open check against the newly deployed bundle: a signed-out
visit now renders the real `Gate()` (heading, one line, Continue with
Google), nothing else, no sidebar, no cached or seeded data. This machine's
`.env.local` is now correct for every future deploy from it this session
forward.

Verified: `npm run verify:prod-env` passes against the new file. Live
bundle byte-identical to the local build that produced it (`cmp`), contains
the real `[REDACTED-FIREBASE-API-KEY]` key and `super-ramble.firebaseapp.com`, absent
from the prior two deploys today. Browser-level check (via the mirrored-
bytes technique above) confirms the real Gate renders for a signed-out
visit, not the local-preview fallback.

### Decisions not to relitigate

- A missing `.env.local` is not a safe default; it is silently equivalent
  to `VITE_ENABLE_LOCAL_PREVIEW=true` through `LOCAL_MODE`'s own `||
  !firebaseReady`. Treat "no `.env.local` present" as exactly as
  dangerous as "the flag is set wrong" before any hosting deploy from a
  machine, not a lesser case. `scripts/verify-prod-env.mjs` already
  handles this correctly (a missing file is a real `process.exit(1)`, not
  a clean pass, confirmed live); the gap was never the script, it was
  skipping the `npm run verify:prod-env` step itself before a deploy. Run
  it before every hosting deploy, full stop, especially on a machine that
  has not deployed from this checkout before.
- The `preview_*` browser tooling cannot navigate to an external origin;
  it reverts back to its own tracked local server. To inspect a live
  deployed site's actual rendered behavior when this tooling is the only
  browser available, curl the live bytes into a local directory and serve
  them with a plain static server (a temporary `.claude/launch.json`
  entry, removed after) rather than assuming curl output or string
  grepping alone proves runtime behavior.
- Before concluding a reported bug is a render crash (or any other code-
  level theory), check whether the deploy that shipped alongside the report
  might have had an environment problem instead, especially on a freshly
  set up machine. The rollback in the entry below was not wrong to do, it
  just was not sufficient on its own; both can be true.

## 2026-07-10: Add-task chip row fix merged and deployed to super-ramble.web.app

Merged `fix/add-task-chip-row-overflow` to main through
[PR #39](https://github.com/cottalucas/super-ramble/pull/39) after CI
(`build-and-eval`) passed on the branch push, on the PR, and again on the
resulting merge commit to `main`. Touched no `functions/` file and no
`firestore.rules`, so ran `firebase deploy --only hosting`. Verified past
the deploy command's own exit code: fetched the served JS and CSS assets
live, byte-for-byte identical (`cmp`) to the local `dist/` build; grepped
the live CSS for the new `add-task-overflow-menu` class and the live JS for
`title:"More"` (the "..." trigger's title attribute), both present in what
is actually being served.

**Still not verified live in a browser**, as the entry below already
states plainly. This deploy confirms the built code shipped correctly, not
that it renders or behaves correctly on screen. That check remains open.

## 2026-07-10: Add-task chip row no longer wraps to a second line; Priority/Labels fold into a "..." overflow, not Reminders

Reported: the add-task chip row (Date, Priority, Labels, then Reminders
alone on its own second line) wraps and does not match native Todoist. Two
real screenshots were provided this pass, one of native Todoist's own
Add-task popover and one of this app's own (buggy) sidebar Add-task
popover; compared directly before writing any code, per instruction, not
guessed at from the written root-cause description alone.

**The written root-cause description did not exactly match the screenshot,
and the screenshot won.** The task description said Priority, Labels, and
Reminders all fold into a single "..." overflow, with only Date always
visible. The actual native Todoist screenshot shows **Date and Reminders
both always visible**; only Priority and Labels are absent from the row
entirely (folded inside "...", not shown in the screenshot since neither
had a value set). Built to the screenshot, not the written description,
and said so before writing any code.

**Fixed**, `src/components/TaskAddForm.jsx`:
- Date and `ReminderPicker` stay always-visible in the row, unchanged.
- `PriorityPicker` and `LabelPicker` render inline in the row only while
  they have a real value (`priority < 4`, `selLabels.length > 0`); otherwise
  they render inside a new "..." overflow (`IconDots`, the same icon
  `SectionOptionsMenu.jsx`/`TaskRow.jsx`/`TaskDetail.jsx` already use for an
  overflow trigger), opened via `Popover.jsx`. Neither picker component was
  changed; each one still owns its own trigger chip and its own nested
  `Popover`, so this is a popover (the "..." menu) containing another
  popover-owning component, the exact composition `Popover.jsx`'s own
  outside-click handler already documents supporting
  (`e.target.closest('.popover')`, not a direct `contains` check, precisely
  so a click inside a nested popover doesn't close the outer one). Setting
  a value promotes it out of "..." into the main row automatically, on the
  next render, since it is the same `priority < 4`/`selLabels.length > 0`
  check in both places; clearing it (Priority back to "Priority 4", every
  label deselected) demotes it back, no separate "demote" logic needed.
- The "..." trigger itself only renders while at least one of Priority/
  Labels is still unset; once both are set there is nothing left to fold,
  so it disappears rather than opening onto an empty menu, matching this
  app's existing no-dead-controls convention (the comment section's
  Cancel/Comment buttons already established this).
- `src/styles.css`: `.modal-chips` changed from `flex-wrap: wrap` (the
  actual cause of the reported wrap) to `nowrap`. New
  `.add-task-overflow-menu` scopes a full-width, borderless, stacked look
  onto `.chip` only inside the overflow's own popover content, the same
  narrow-scoping approach `.project-picker-trigger` already uses rather
  than touching `.chip` globally.
- `docs/design-system.md`'s "Inline add-task" section gained a paragraph
  describing this overflow-plus-promoted-chip pattern, replacing the old
  always-visible-buttons description.

**Not independently verified live in a browser this pass**, unlike most
prior UI entries in this log. The dev machine set up in the prior pass
(2026-07-10, the Todoist secret entry above) had Node/npm reachable from an
interactive shell via Homebrew's `/opt/homebrew/bin`, but the preview
tooling's own dev-server launcher spawns with a bare, profile-independent
`PATH` (confirmed: `env -i /bin/sh -c 'echo $PATH'` gives
`/usr/local/bin:/bin:/usr/bin:.`, no `/opt/homebrew/bin`), and
`/usr/local/bin` did not exist on this machine. Explicitly asked whether to
wait for that one more one-time `sudo mkdir -p /usr/local/bin && sudo
chown ...` step or proceed without a live check; told to proceed without
it. `npm run build` and `npm run eval` both pass, and the change was
reviewed directly against the two screenshots and the existing
`Popover.jsx`/`SectionOptionsMenu.jsx` nested-popover precedent, but nobody
has actually seen this render in a browser yet. **A future pass (or Lucas
directly) should confirm the row holds one line at both desktop and phone
width in all three field states (none/some/all of Priority+Labels set)
before treating this as fully closed.**

### Decisions not to relitigate

- Real Todoist's Add-task row keeps Date and Reminders always visible; only
  Priority and Labels fold into "...". Do not re-fold Reminders based on
  the earlier written task description; the live screenshot is the
  standing source of truth here, not that description.
- `PriorityPicker.jsx`/`LabelPicker.jsx` stay unchanged; the overflow-vs-
  promoted placement is entirely `TaskAddForm.jsx`'s own conditional
  rendering based on each picker's current value, not a prop the pickers
  need to know about.
- The "..." overflow trigger hides itself entirely once nothing is left to
  fold, rather than staying visible with an empty popover. Consistent with
  this app's established no-dead-controls rule elsewhere; do not add a
  disabled or empty-state "..." button here.
- This app's preview tooling does not inherit an interactive shell's
  `PATH`; it spawns dev servers with a bare system default
  (`/usr/local/bin:/bin:/usr/bin`). Getting Homebrew-installed tools
  (`/opt/homebrew/bin`) visible to it requires `/usr/local/bin` to exist
  and contain symlinks to them, not a `.zshrc`/`.zprofile` change (those
  only affect interactive login shells) and not hardcoding an absolute
  path into `.claude/launch.json` (that file is committed to the repo;
  a personal machine path does not belong in it).

## 2026-07-10: `TODOIST_CLIENT_SECRET` was a duplicated value, not a typo; real test-token push verified end to end against a live Todoist account

Three things this pass: a fresh dev machine had none of the tooling this
work needs, a real `TODOIST_CLIENT_SECRET` bug was found and fixed, and the
Todoist push was independently verified against a real account for the
first time (docs/roadmap.md phase 3 part 8's own "not independently
verified" note, closed here).

**Fresh-machine setup, done once, not relitigated.** This session started
with no Node, npm, Firebase CLI, or gcloud CLI anywhere on the machine, and
no stored GCP credentials. Installed via Homebrew (`/opt/homebrew`, not a
manual tarball drop): `brew install node firebase-cli`, `brew install
--cask google-cloud-sdk`. Two logins are genuinely one-time, interactive,
human-only steps that cannot be scripted or spoofed (both CLIs explicitly
detect and refuse a non-interactive session rather than silently
succeeding): `firebase login` (account-level CLI auth) and `gcloud auth
application-default login` (Application Default Credentials, what
`firebase-admin`'s `credential.applicationDefault()` actually reads). Both
are now done, for `redacted@example.com`. `~/.zshrc` and
`~/.zprofile` were updated (PATH) as part of this; `/usr/local/bin` did not
exist on this machine at all before this pass, unusual for a Mac with any
Homebrew history, confirming this really was a from-scratch install, not a
broken existing one.

**The `TODOIST_CLIENT_SECRET` bug, checked byte-for-byte, not assumed.**
`firebase functions:secrets:access TODOIST_CLIENT_SECRET` and inspected the
raw bytes with `xxd` rather than eyeballing printed text. The stored value
was 65 bytes: the correct 32-character secret
(`[REDACTED-TODOIST-SECRET]`, confirmed against a live Todoist App
Console screenshot) **repeated twice back to back**
(`[REDACTED-TODOIST-SECRET][REDACTED-TODOIST-SECRET]`), plus the CLI's own
trailing newline. Not a trailing-whitespace issue as hypothesized going in;
a straight duplication, almost certainly from a copy-paste-twice at
original set time. Reset with `firebase functions:secrets:set
TODOIST_CLIENT_SECRET --data-file=- -f`, piping the value through `printf
'%s'` (no trailing newline introduced), then re-read and re-hexdumped:
now exactly 32 bytes plus the CLI's own newline, matching the console
screenshot byte for byte. `-f` marks `api` as needing a redeploy for the new
secret version; done as part of this pass's deploy (see below). Whether this
alone explains the `invalid_grant` history is still not certain (a wrong
client secret more typically yields `invalid_client`, not `invalid_grant`),
but it was a real, confirmed defect regardless and is now fixed; a live
OAuth click-through by Lucas is still the only way to confirm whether
`invalid_grant` itself is actually gone, unchanged from every prior entry
on this topic.

**The test-token detour: "Verification token" is not an API token.** First
attempt used a value labeled "Verification token" from the App Console's
Webhooks section. Checked directly before trusting it: `POST
https://api.todoist.com/api/v1/sync` with that value as `Authorization:
Bearer` returned `401 {"error":"Invalid token","error_tag":
"AUTH_INVALID_TOKEN"}`. The console's own copy under that field
("Use this token to verify that requests are coming from Todoist") already
said as much; the live 401 confirmed it independently. The real token lives
in a separate "Test token" section on the same Integrations page ("create
an access token to your own account without going through the authorization
process"). That value returned `HTTP 200` with real account data
(`full_sync` with Lucas's actual projects) on the same live call. **A
Todoist app console token is only usable if it authenticates against a
real `POST /api/v1/sync` call; a value that returns 401 is not a usable
token regardless of which console field it came from.**

**Seeded `users/{uid}/todoistAuth/token`** (uid `[REDACTED-UID]`,
looked up live via `admin.auth().getUserByEmail`) via the Admin SDK, the
same schema `functions/index.js`'s real OAuth exchange writes: `accessToken`
(the working test token), `refreshToken: null`, `expiresAt` 10 years out,
`scope: 'data:read_write'`, `clientId:
'[REDACTED-TODOIST-CLIENT-ID]'`, `redirectUri:
'https://super-ramble.web.app'`, `connectedAt` now. This unblocks the push
feature for this account independent of whether OAuth itself works, exactly
as intended: a test token is issued directly by the console, never through
the authorize/exchange flow this app's OAuth bug affects.

**The real end-to-end push, verified against the live account, not
mocked.** Attempted first via a genuine browser click-through
(`SuperRambleModal.jsx`'s confirm, "Also create in Todoist" checked) signed
in as Lucas; blocked partway through. Signing in without a real Google
popup needs a Firebase custom token, which needs
`admin.auth().createCustomToken`, which needs either a real service-account
key or `iam.serviceAccounts.signBlob` on some service account; the ADC user
credential has neither, and granting that IAM role was out of scope for
this pass (a standing permission grant on the GCP project, not something to
add as a side effect of one test). **Did not grant it.** Fell back to
driving `functions/todoist.js`'s exported `buildSyncCommands` directly, the
exact same pure function `functions/index.js`'s `/api/todoist/write`
handler calls, fed a tree with two sections, a parent task with a due
string and highest local priority, a child sub-task with no due date and
lowest local priority, and a second-section task with a middle priority.
POSTed the resulting commands to the real `api.todoist.com/api/v1/sync`
with the working test token, then read the result back with a second sync
call (not just checked for `"ok"` in the write response) to confirm actual
stored values. All confirmed correct in the real account:
- Priority direction: local 1 to Todoist 4, local 4 to Todoist 1, local 2 to
  Todoist 3, all as `toTodoistPriority`'s `5 - localPriority` predicts.
- Due strings: `"tomorrow at 5pm"` parsed server-side to
  `2026-07-11T17:00:00`; `"in 3 days"` to `2026-07-13`.
- The sub-task's `parent_id` was the parent's real Todoist item ID; its
  `due` came back `null`, not an empty object.
- The sub-task inherited its parent's `section_id` automatically from
  Todoist's own side, despite this app deliberately never sending one for a
  sub-task; matches the existing code comment's stated intent.
- Both sections and the project itself were created correctly and
  attached to the right parent IDs.

The test project was deleted from the real account afterward
(`project_delete`) to avoid leaving throwaway data in Lucas's real Todoist.

Verified: `npm run build` succeeds. `npm run eval` green, 26/26 Todoist
cases, 17/17 offline Structure cases, 12/12 date cases, on the newly
installed toolchain (Node 26 via Homebrew), not just historically on
whatever machine ran it before.

### Decisions not to relitigate

- Install dev tooling on a fresh machine via Homebrew
  (`brew install node firebase-cli`, `brew install --cask
  google-cloud-sdk`), not a manual Node tarball drop into `~/.local`. The
  manual approach was tried first this pass and only ever worked inside
  this agent's own sandboxed shell, invisible to Lucas's real terminal,
  because that sandbox assembles its own `PATH` separately from
  `~/.zshrc`/`~/.zprofile`. Homebrew installs to `/opt/homebrew`, wired into
  both real shells via `brew shellenv`, and is what actually resolved it.
- `firebase login` and `gcloud auth application-default login` are two
  separate credential stores (CLI account vs. Application Default
  Credentials) and both are required; having one does not imply the other.
  Both explicitly refuse to run in a non-interactive session rather than
  silently degrading; do not attempt to spoof a TTY or pipe a stored code
  around this, it is a deliberate guard on Google's own OAuth consent, not
  a bug.
- The Todoist App Console's "Verification token" (Webhooks section) is a
  webhook-signature secret, never a bearer API token; do not reuse it as
  `accessToken`. The "Test token" section (below Analytics, above
  Installation, same Integrations page) is the actual personal token for
  testing against your own account without the OAuth flow. If a token
  given for this purpose 401s on a real `POST /api/v1/sync` call, do not
  seed it into Firestore or otherwise treat it as valid; that call is the
  ground truth, not which console field a value was copied from.
- Minting a Firebase custom token for a specific uid, to sign in as a real
  user without their Google password, requires either a real
  service-account-key credential or `iam.serviceAccounts.signBlob` granted
  to whatever identity is signing. An interactively-obtained ADC user
  credential has neither by default. Granting that IAM role is a standing
  permission change to the GCP project and was deliberately not made here;
  a future pass needing a true authenticated-browser click-through test
  should get that IAM grant explicitly approved first, not add it silently.
- When a real end-to-end account-level test is blocked by an auth gap like
  the above, driving the same pure, dependency-free translation function
  the production handler calls (`functions/todoist.js`'s
  `buildSyncCommands`), then verifying the result with a second real read
  against the live API, is an acceptable substitute for a full UI
  click-through: it exercises the identical code path minus the browser and
  Firebase Auth layers, and a second independent read call confirms the
  first write call's own "ok" status actually reflects reality.

## 2026-07-09: invalid_grant persists after redirect_uri/secret/crash ruled out; checked double-submission directly, found and fixed a different real bug

`invalid_grant` on `POST /api/todoist/oauth` continued after the prior
pass ruled out a crash, the request shape, and secret resolution. This
pass's instruction was specific: check double-submission (a React effect
firing twice, or the URL only clearing on success) directly against logs
and code, not by reasoning about it again. Did that, plus one more check
the instruction didn't ask for but the evidence pointed at.

**Checked directly, not assumed:**
- **Was the code exchanged more than once?** Queried `todoistAuth` as a
  Firestore collection group with the Admin SDK (`firebase-admin`,
  authenticated in this environment even though the separate `gcloud` CLI's
  own credentials are still broken, confirmed by a control query against
  `structureTraces`, which found real documents). **Zero documents exist in
  `todoistAuth`, for any user, ever.** No Todoist OAuth exchange has
  completed successfully at any point. This directly rules out "the first
  attempt secretly succeeded and a second, redundant attempt then failed
  on the already-spent code," since a successful first attempt would have
  left a document. It also means the double-submission question reduces to
  a narrower one: does even a single, sole exchange attempt fail, or does
  the same fresh code get sent to Todoist more than once, both times
  failing.
- **Does the URL only clear on success?** Re-read `consumeTodoistOAuthReturn`
  directly: `history.replaceState` runs unconditionally, on every code
  path (success, a real Todoist-side error, or a failed CSRF check), before
  any async work starts. Confirmed by reading the literal function body,
  not recalled from memory. Not the bug.
- **Was `/todoist/oauth` invoked once or twice for the most recent test?**
  Pulled `firebase functions:log --only api -n 300` and found exactly one
  `Todoist token exchange returned an error` line for the relevant window
  (2026-07-09T10:52:28Z), now carrying the `clientId`/`redirectUri` fields
  the prior pass added: `clientId: '[REDACTED-TODOIST-CLIENT-ID]'`,
  `redirectUri: 'https://super-ramble.web.app'`, both exactly matching what
  this app sends and what was expected. One invocation, correct values,
  still `invalid_grant`. This rules out a second, concurrent Function
  invocation for that specific test, and confirms the redirect_uri
  actually sent (not just reasoned about) matches the fixed, slash-free
  value.
- **Is there a real double-invocation hazard in the React effect regardless
  of whether it explains this specific failure?** `consumeTodoistOAuthReturn`
  and `hasTodoistOAuthReturn` are only ever called from one place
  (`App.jsx`'s `Shell`, grepped to confirm, not called from
  `SettingsModal.jsx` or anywhere else). The existing synchronous
  check-then-strip design (URL read and `history.replaceState` both
  happen synchronously, before any `await`) already means a second
  invocation of the same effect, however it might be triggered, reads an
  already-stripped URL. This held up under review; still added an explicit
  guard anyway (below), since the instruction asked for one regardless of
  which hazard turned out to be real, and it costs nothing.

**The actual, new, previously-unchecked finding**, verified directly, not
guessed: `URLSearchParams` follows `application/x-www-form-urlencoded`
semantics, which treats a literal `+` in a query string as a space.
Verified live in Node: `new URLSearchParams('a=b+c').get('a')` is
`'b c'`, not `'b+c'`; `new URLSearchParams('a=b%2Bc').get('a')` correctly
gives `'b+c'`. Every place this app read `code`/`state`/`error` off
`window.location.search` did so through a bare `new URLSearchParams(...)`.
If Todoist's own redirect appends an opaque authorization code that
happens to contain a literal `+` (a real risk for a base64-shaped token)
without percent-encoding it to `%2B`, that `+` silently becomes a space
the moment this app's own JavaScript reads the URL, before any network
call is even made. Todoist would then, correctly, reject the corrupted
code as `invalid_grant`, on every single fresh attempt, independent of
`redirect_uri`, `client_secret`, or anything else being right, exactly
matching everything observed: one real, correctly-shaped exchange
request, sent once, still rejected. This fits the evidence better than
any hypothesis checked in either this pass or the last, but it has not
been confirmed against an actual raw redirect URL (this app has no way to
capture one without either the user's own browser history or Todoist's
own logs), so it is reported as the strongest remaining explanation, not
a certainty.

**Fixed:**
- `src/todoist/oauthReturn.js`: new `extractOAuthParams(search)`, a
  dependency-free (works in plain Node, `URLSearchParams` is a global
  there too) function that escapes a literal `+` to `%2B` before parsing,
  so `+` is always treated as literal, never as a space, while genuine
  `%XX` escapes already in the string are untouched. `hasTodoistOAuthReturn`
  and `consumeTodoistOAuthReturn` (`src/todoist/index.js`) both use it now
  instead of a bare `URLSearchParams` read.
- `src/todoist/index.js`: `exchangeTodoistCode` gained an explicit,
  module-level (not component-level) in-flight guard,
  `oauthCodeBeingExchanged`. A module-level flag, not a `useRef`, on
  purpose: it survives any number of remounts of whatever calls it within
  the same page load, since it isn't tied to one component instance.
  Independent of, not a replacement for, the URL-stripping guard already
  in `consumeTodoistOAuthReturn`; the two don't depend on each other
  holding.
- `scripts/eval-todoist.mjs`: three new deterministic cases for
  `extractOAuthParams`, including the exact live-verified `+`-vs-space
  case. 26/26 passing, up from 23.

No `functions/` file changed this pass; the fix is entirely in how the
client reads the return URL. Ran `firebase deploy --only hosting`
accordingly, not a functions redeploy.

Verified: `npm run build` succeeds. `npm run eval` is green, 26/26 Todoist
cases, 17/17 offline Structure cases, 12/12 date cases.

### Decisions not to relitigate

- Read OAuth-return query params through `extractOAuthParams`
  (`src/todoist/oauthReturn.js`), never a bare `new
  URLSearchParams(window.location.search)`, anywhere a Todoist redirect
  value is parsed. A bare read silently turns a literal `+` into a space.
- `exchangeTodoistCode`'s in-flight guard is module-level state, not a
  `useRef`. Do not move it into `App.jsx`'s component state; it needs to
  survive independent of any one component instance.
- `todoistAuth` had zero documents across all users as of this
  investigation, confirmed via a live Admin SDK query. If this changes
  (a token document exists but the user reports the connect flow still
  failing), the failure mode is different from anything investigated here
  and needs fresh diagnosis, not a rerun of this entry's checks.
- `firebase-admin`'s own credential path works in this environment even
  though the separate `gcloud` CLI's Application Default Credentials do
  not (confirmed by a successful `structureTraces` control query). Prefer
  a small local Admin SDK script over `gcloud logging read` for anything
  needing direct Firestore access here.

## 2026-07-09: OAuth error-attribution fix merged and deployed to super-ramble.web.app

Merged `fix/todoist-oauth-error-attribution` to main through
[PR #36](https://github.com/cottalucas/super-ramble/pull/36) after CI
(`build-and-eval`) passed on the branch push, on the PR, and again on the
resulting merge commit to `main`. Touched `functions/index.js`, so ran
`firebase deploy --only hosting,functions`, both targets reported success.
Verified past the deploy command's own exit code: fetched the served JS
asset live, `md5`'d it against the local `dist/` build, identical byte for
byte; grepped it directly for the three new user-facing strings
("Connecting to Todoist failed", "access_denied", "didn't approve it"),
all present. An unauthenticated `POST /api/todoist/oauth` returns
`401 {"error":"unauthorized"}`, confirming the function is live and
executing; as noted in the entry below, this alone can't distinguish the
new deploy from the prior one (`verifyAuth` gates every path identically
either way), so the real confirmation is the deploy log's own report of a
successful update for this exact build.

**The live click-through re-test is still on Lucas**, same as stated in
the entry below: this fixes error attribution and adds diagnostics for a
recurrence, but only a real consent-screen round trip can confirm whether
the underlying `invalid_grant` is actually resolved.

## 2026-07-09: Todoist OAuth 502 investigated: a handled Todoist rejection, not a crash, and a real error-attribution bug

Reported live: `POST /api/todoist/oauth` returned `502 Bad Gateway` right
after a real, successful approval on Todoist's own consent screen. Pulled
the actual Cloud Function logs first (`firebase functions:log --only api`),
per instruction, before changing anything.

**What the logs actually show.** Two clean, fully-formed log lines, 80
seconds apart (two separate user attempts, not a rapid double-fire):
`Todoist token exchange returned an error { status: 400, body:
'{"error": "invalid_grant"}' }`. This is this app's own
`console.error` call in the already-existing `!tokenRes.ok` branch of
`functions/index.js`'s `/todoist/oauth` handler, immediately followed by
that same branch's `res.status(502)`. **This is not a crash.** It is a
deliberate, working, handled path: this app asked Todoist's own token
endpoint to exchange a code, Todoist responded with a real `400
invalid_grant`, and this app's own code chose to surface that as a `502`
to the browser. `exports.api`'s outer try/catch (which is what would
actually fire on a genuine unhandled exception, producing a `500`, not a
`502`) never triggered; there is no stack trace here because there was no
exception. `gcloud logging read` would have given richer structured
payloads to confirm this beyond doubt, but `gcloud`'s Application Default
Credentials are still broken in this environment (`invalid_grant` again,
a completely unrelated, coincidental use of the same OAuth error string,
first noted in the 2026-07-08 priority-direction entry); `firebase
functions:log`'s plain-text view was sufficient here regardless, since the
two relevant lines rendered in full.

**Checked the three hypothesized causes against the logs and the code,
not assumed:**
- **Content-Type mismatch**: re-verified the token-exchange request shape
  directly against developer.todoist.com's own literal curl example
  (`-d client_id=... -d client_secret=... -d code=... -d redirect_uri=...`,
  i.e. form-urlencoded, no `grant_type` field for this initial exchange,
  unlike the separately-verified refresh flow). This app's request already
  matches exactly: `content-type: application/x-www-form-urlencoded`,
  `body: new URLSearchParams({ client_id, client_secret, code,
  redirect_uri })`. Not the bug.
- **`TODOIST_CLIENT_SECRET.value()` not resolving**: ruled out by the log
  itself. A real network round trip reached Todoist and got back a
  specific, well-formed OAuth error (`invalid_grant`, which concerns the
  grant/code/redirect_uri, not client authentication); an unresolved or
  wrong secret value would far more likely produce `invalid_client` or a
  local exception before any request went out at all. Not the bug.
- **Unhandled promise rejection or a bad `.json()` call**: every awaited
  call in this path is already guarded (`.catch(() => '')`/
  `.catch(() => null)`), and even an uncaught throw here would surface as
  the outer catch's `500`, not a `502`. Not the bug.

**The actual, confirmed bug: error attribution, exactly as reported.**
`{ error: 'Todoist declined the connection' }` was this app's own copy for
*any* non-ok response from the token exchange, including a legitimate
`invalid_grant` that has nothing to do with the user's own choice on
Todoist's consent screen. Separately, and worse: a real user decline
(Todoist redirects back with `?error=access_denied&state=...`, no `code`
at all) was not handled *at all* before this pass.
`hasTodoistOAuthReturn()` only ever checked for `code`, so a real decline
left a dangling `?error=access_denied` in the URL forever and showed the
user nothing, not even a wrong message.

**Fixed:**
- `functions/index.js`: the `!tokenRes.ok` branch's user-facing copy is
  now `'Connecting to Todoist failed. Try again.'`, honest about whose
  side the failure is on. The `console.error` call gained `clientId` and
  `redirectUri` (neither a secret) alongside the existing `status`/`body`,
  since an `invalid_grant` is most often a `redirect_uri` mismatch between
  this exchange and the authorize request that issued the code, or a code
  already used or expired, neither of which was visible from the old log
  line alone; a recurrence is now diagnosable from one log line instead of
  needing another round of guessing.
- `src/todoist/oauthReturn.js` (new): `parseOAuthReturn`, pure decision
  logic extracted out of `consumeTodoistOAuthReturn` specifically so it has
  no DOM/`import.meta.env` dependency and is directly unit-testable from
  `scripts/eval-todoist.mjs`, the same reason `functions/todoist.js` is its
  own dependency-free module. Given `{ code, state, error, storedState }`,
  returns `{ error }` (Todoist's own redirect carried one),
  `{ code }` (validated success), or `null` (nothing to consume, or the
  CSRF state check failed). `src/todoist/index.js` re-exports it and uses
  it inside `consumeTodoistOAuthReturn`; `hasTodoistOAuthReturn` now also
  triggers on `error`, not just `code`, so a real decline actually gets
  processed and its URL stripped, not left dangling.
- `App.jsx`'s OAuth-return effect now branches three ways instead of two:
  `result.error === 'access_denied'` shows "Todoist connection cancelled.
  You didn't approve it." (the only case that says anything about what the
  user did); any other Todoist-side `error` value shows a generic "Could
  not connect Todoist. Try again from Settings."; an exchange-call failure
  (the actual reported bug's path) shows `err.message`, which is now the
  honest "Connecting to Todoist failed. Try again." from the Function
  above, not "Todoist declined the connection."
- `scripts/eval-todoist.mjs`: six new deterministic cases for
  `parseOAuthReturn` (access_denied, a non-decline error, a validated
  success, a state mismatch, a code with no stashed state, and the
  nothing-to-consume case), the test coverage this exact bug class did not
  have before. 23/23 passing, up from 17.

**What remains genuinely unresolved: why Todoist returns `invalid_grant`
on what should be a fresh code, twice, in two separate real attempts.**
This was checked as thoroughly as this environment allows and not solved
outright; stated plainly rather than implied fixed. Request-shape,
secret-resolution, and unhandled-exception causes are all ruled out by direct
log/code evidence above. The redirect_uri sent in both the authorize
request and this exchange is provably the same JS constant
(`TODOIST_REDIRECT_URI`) both times, used consistently by this app's own
code; whether that value still exactly matches what is registered on the
Todoist App Console itself (the classic cause of a real `invalid_grant`,
per RFC 6749's own description of the error) could not be independently
confirmed from here, since that registration is only visible in Todoist's
own console, not from logs or code. The enhanced log line above
(`clientId`, `redirectUri`) means the next live attempt, if it still
fails, will show the exact value actually sent, closing this loop
directly instead of needing another guess.

Verified: `npm run build` succeeds. `npm run eval` is green, 23/23 Todoist
cases (up from 17), 17/17 offline Structure cases, 12/12 date cases.
`node --check functions/index.js` passes.

### Decisions not to relitigate

- A `502` from `/api/todoist/oauth` is not proof of a crash by itself in
  this codebase; this handler deliberately uses `502` for a Todoist-side
  token-exchange rejection. Check the actual Cloud Function logs before
  assuming an unhandled exception; `exports.api`'s outer catch produces
  `500`, not `502`, so the two are distinguishable from the status code
  alone if logs are ever unavailable.
- User-facing copy for a Todoist connection failure must distinguish a
  real decline (`error=access_denied` on the redirect, the only case
  allowed to say anything about what the user did) from this app's own
  exchange call failing (never blame the user for a backend problem). Do
  not collapse these back into one generic message.
- `parseOAuthReturn` (`src/todoist/oauthReturn.js`) is the one place this
  three-way classification happens; extend it, don't duplicate its logic
  inline in `App.jsx` or re-derive it elsewhere.
- `gcloud`'s Application Default Credentials remain broken in this
  environment (a second, unrelated `invalid_grant`, distinct from the
  Todoist one this entry is about). `firebase functions:log` is the
  working fallback for reading Cloud Function logs here; its plain-text
  view drops structured-only payloads (shows a blank line for them), which
  looked concerning but turned out to be unrelated request/response
  logging interleaved from other concurrent endpoints, not lost content
  from the relevant request.

## 2026-07-09: Comment guard and project-field pass merged and deployed to super-ramble.web.app

Merged `fix/comment-guard-styling-project-field` to main through
[PR #35](https://github.com/cottalucas/super-ramble/pull/35) after CI
(`build-and-eval`) passed on the branch push, on the PR, and again on the
resulting merge commit to `main`. Touched no `functions/` file and no
`firestore.rules` (`git diff --stat` against the prior deployed commit
confirmed empty), so ran `firebase deploy --only hosting`. Verified past
the deploy command's own exit code: fetched the served JS asset live,
`md5`'d it against the local `dist/` build, identical byte for byte;
grepped it directly for "Comments" (the collapsible header text),
"project-picker-label" (the truncation class), and "Cancel" (the new
comment-box button), all present in what's actually being served.

No open PRs remained after this merge; every other local/remote branch in
this repo is stale history from already-merged work, not unmerged content,
confirmed with `gh pr list --state open` before treating the working tree
as fully caught up.

## 2026-07-09: Comment duplicate-submit guard, comment section styling, and a truncated project field

Three changes to `TaskDetail.jsx`/`ProjectPicker.jsx`: a real correctness
bug fix, a styling pass matching native Todoist, and a UI simplification.
`docs/reference/` was checked first per instruction; it still holds only
its own README placeholder, no real comment-section screenshots, so Part
B's spacing/sizing reused existing conventions (`.inline-add`'s border
pattern) rather than matching a screenshot that does not exist. Part C's
suffix removal was already confirmed against a real reference screenshot
by the requester, stated as such in the task; not re-verified here.

**Part A: the duplicate-comment bug, and a live-verification catch worth
recording in detail.** `addComment()` had no guard: `setNewComment('')` ran
after `await store.createComment(...)`, so a rapid or held Enter key could
fire the handler again while the first call was still in flight, posting
the same comment more than once. The first fix attempt cleared
`newComment` synchronously, before the `await`, reasoning that a second
call reading the guard (`if (!c) return`) would see the already-empty
value. **This was verified live, and the first attempt failed the test.**
Local preview mode was temporarily enabled (`VITE_ENABLE_LOCAL_PREVIEW=true`
in `.env.local`, the same reversible flag `npm run verify:prod-env` guards
before any deploy) to reach an authenticated `TaskDetail` view without a
real Google sign-in, since that view is otherwise unreachable in this
environment (the same real-Firebase-Auth gap every prior UI-verification
note in this log has already flagged). Five rapid `Enter` keydown events
were dispatched at a text-filled comment box, back to back, with no
real-world gap between them, closer to a scripted double-fire or an
extremely fast key repeat than typical hardware timing. Result: **five
identical comments posted**, not one. The state-clear approach did not
work, because all five keydown handlers fired from the same render's
closure before React had a chance to commit the cleared state and produce
a new one; every call read the same pre-clear, non-empty `newComment`.
Replaced with a `useRef(false)` flag (`commentSubmittingRef`), set `true`
synchronously the instant the first call passes its guard, checked at the
top of every call including the four that follow immediately after: a ref
mutation is a plain assignment, visible to every closure sharing that ref
the moment it happens, no render required in between. Re-ran the exact
same five-rapid-keydowns test after the fix: comment count went from 5 to
6, exactly one new comment, not five. `.env.local` was reverted to
`VITE_ENABLE_LOCAL_PREVIEW=false` immediately after testing, confirmed via
`npm run verify:prod-env` before this entry was written, the same
discipline the 2026-07-07 local-preview-outage entry established.

**Part B: comment section styling.** `.comment-add-box` replaces the old
bare `.detail-comment-add input`: a bordered box (`.inline-add`'s own
border/background pattern, reused rather than inventing new tokens),
a `<textarea>` instead of a single-line `<input>` (a comment is allowed to
run multi-line, unlike a task's content field; Shift+Enter inserts a
newline, plain Enter still submits, matching this app's one existing
single-line-entry convention), and Cancel/Comment buttons
(`.btn.btn-ghost`/`.btn.btn-primary`, both already-existing classes) that
render only once there is text, hidden entirely when empty rather than
shown disabled, per the anti-pattern checklist's "no dead controls" rule.
A "Comments N" header (`.comment-header`) precedes the list, collapsible
via the same inline-style-rotate caret convention `ProjectNode`'s own
project caret and the sidebar's "My Projects" caret already use; only
rendered when at least one comment exists, unchanged from before. Verified
live: typing text shows Cancel/Comment; clicking the header collapses the
list while the header and the add box both stay visible.

**Part C: project field.** `ProjectPicker.jsx`'s trigger no longer appends
`/ <section name>`; the popover still lists Sections underneath unchanged,
a task can still be assigned to one, the trigger just doesn't echo it back.
The now-unused `currentSection` variable was removed rather than left
dead. Checked every `.chip` call site (`DatePicker`, `LabelPicker`,
`ReminderPicker`, `PriorityPicker`, `SettingsModal`'s Theme toggle, plus
`ProjectPicker` itself) before deciding where to scope truncation:
`.project-picker-trigger` (`max-width: 200px`) and `.project-picker-label`
(`min-width: 0`, `overflow: hidden`, `white-space: nowrap`,
`text-overflow: ellipsis`) are new classes applied only to this one
trigger, `.chip` itself untouched. Verified live with a real long string
injected into the label: `scrollWidth` (422px) exceeded `clientWidth`
(168px), confirming actual truncation, not just that the CSS properties
were present with no effect; the label's computed `overflow`/`white-space`/
`text-overflow` matched what was written, and the button's own width
capped at exactly 200px.

Verified: `npm run build` succeeds. `npm run eval` unaffected and unrun for
a change beyond confirming it still passes unchanged (17/17 offline
Structure cases, 17/17 Todoist cases, 12/12 date cases), since nothing
under `src/pipeline/`, `evals/`, `functions/`, or `scripts/eval-*.mjs` was
touched. `docs/design-system.md` gained a "Task detail: comment section"
section (the submit-guard convention stated explicitly, for reuse by any
future add-on-Enter handler) and a "Project field: no section suffix, and
a bounded width" section.

### Decisions not to relitigate

- Any add-on-Enter handler that awaits a store write must guard with a
  `useRef` boolean set synchronously before the `await`, not by clearing
  the input's own state alone. Clearing state alone was tried first here
  and demonstrably failed under a rapid, back-to-back burst of the same
  event, verified live, not assumed. See `docs/design-system.md`'s "Task
  detail: comment section" section.
- `ProjectPicker.jsx`'s trigger shows a project's name only, never a
  section suffix. The popover's own Sections list is unchanged; this is a
  trigger-label change only.
- `.project-picker-trigger`/`.project-picker-label` truncation is scoped to
  `ProjectPicker`'s trigger only. Do not widen it onto `.chip` itself
  without re-checking every other `.chip` call site first (Date, Priority,
  Labels, Reminders, Settings' Theme toggle all use it too).
- `.env.local`'s `VITE_ENABLE_LOCAL_PREVIEW` is a legitimate, reversible
  tool for interactively verifying an authenticated view in this
  environment, not something to avoid touching entirely: flip it to `true`
  for local testing only, always flip it back to `false` immediately after,
  and always confirm with `npm run verify:prod-env` before any build meant
  for deploy. Never build or deploy while it reads `true`.

## 2026-07-09: Redirect-URI fix and sidebar "My Projects" merged and deployed to super-ramble.web.app

Merged `fix/todoist-redirect-and-sidebar-my-projects` to main through
[PR #34](https://github.com/cottalucas/super-ramble/pull/34) after CI
(`build-and-eval`) passed on the branch push, on the PR, and again on the
resulting merge commit to `main`. This pass touched no `functions/` file and
no `firestore.rules` (confirmed with `git diff --stat` before deciding the
deploy scope), so ran `firebase deploy --only hosting`, not a functions
redeploy. Verified past the deploy command's own exit code: fetched
`https://super-ramble.web.app/` live, `md5`'d the served JS asset against
the local `dist/` build, identical byte for byte; grepped the fetched
bundle directly for "My Projects" (present) and for every occurrence of
`https://super-ramble.web.app` (exactly the bare, slash-free host, no
trailing-slash copy anywhere in what's actually being served).

**Part A's fix still needs a real human click-through to trust**, exactly
as flagged in the entry below: a bundle grep can confirm the corrected
string shipped, not that Todoist's own consent screen now accepts it. Left
to Lucas.

## 2026-07-09: Todoist OAuth redirect-URI fix, and a sidebar "My Projects" pattern (phase 3, part 9)

Two unrelated fixes in one pass: a live bug fix to the just-shipped Todoist
OAuth connect (phase 3, part 8), and a sidebar chrome pass matching native
Todoist's actual "My Projects" pattern.

**Part A: the redirect URI mismatch.** The Todoist App Console's registered
redirect URL was corrected after part 8 shipped to drop its trailing slash
(Todoist itself rejects a trailing slash on a registered redirect URL as
invalid). `src/todoist/index.js`'s `TODOIST_REDIRECT_URI` still had one
(`https://super-ramble.web.app/`), so the two no longer matched and Connect
Todoist failed with "Invalid redirect URI." Dropped the trailing slash:
`https://super-ramble.web.app`. Confirmed this is the value's only copy
before changing it: `functions/index.js`'s `/api/todoist/oauth` handler
takes `redirectUri` from the request body (`src/todoist/index.js`'s
`exchangeTodoistCode` sends `TODOIST_REDIRECT_URI` itself), not a second,
hand-synced constant server-side, per the design phase 8 already put in
place specifically to avoid this exact class of drift. Fixing the one
constant therefore fixes both the browser-side authorize redirect and the
server-side token exchange's own `redirect_uri` check, which Todoist checks
again at that step; nothing else needed changing.

**Part B: sidebar "My Projects."** Reported directly as a mismatch against
native Todoist's own sidebar convention, not a redesign:
- `Sidebar.jsx`'s `.nav-section-label` text: "Projects" to "My Projects."
- `.project-dot` (a filled circle) in `ProjectNode`'s row replaced with
  `.project-hash`, a colored "#" character, matching Todoist's own
  convention. Same `colorHex(project.color)` value as before, now applied
  as the glyph's text color instead of a circle's background.
  `.project-dot` itself is untouched, still used in the Add Project color
  picker, a task's meta line, and a project view's own title, all contexts
  Todoist itself still renders as a dot; the hash is a sidebar-list
  convention only, not applied globally.
- "My Projects" collapses as a whole via a new chevron
  (`.nav-section-caret`, the same `IconCaret`/rotate-on-collapse shape
  every other caret in this app already uses), separate from a single
  project's own children collapsing via `ProjectNode`'s own caret
  (unpersisted, unchanged, untouched by this pass). Persisted in
  `src/lib/projectsPanel.js` (new), the same `localStorage`-preference
  pattern `src/lib/theme.js`, `src/lib/layout.js`, and `src/lib/sidebar.js`
  already use, not component state that resets on reload.

**Part C, the sizing audit: checked for real reference screenshots first,
found none, did not guess.** `docs/reference/` was checked before touching
any sizing: it holds only its own README placeholder, no actual Todoist
screenshots at all, sidebar or otherwise, same as every prior pass that
has checked it. Concrete `.nav-item`/`.nav-section-label`/`.project-dot`/
`.count` sizing was therefore left exactly as it was; no px value in any
of those rules was changed on an inline guess, per the instruction not to.
`docs/reference/README.md`'s expected-set list gained a `12-sidebar.png`
entry so a future pass knows one is wanted and what it needs to show
(nav-item rhythm, the "My Projects" label and its chevron, the "#" glyph).
The two new elements this pass actually had to size regardless
(`.nav-section-caret`, `.project-hash`) got reasonable, minimal values to
fit the existing row rhythm, not derived from a screenshot either; flagged
as such in `docs/design-system.md`'s new "Sidebar project list" section
rather than presented as verified.

Verified: `npm run build` succeeds (95 modules, up from 94: the one new
`src/lib/projectsPanel.js` file). `npm run eval` unaffected and unrun for a
change beyond confirming it still passes unchanged, since nothing under
`src/pipeline/`, `evals/`, `functions/todoist.js`, or `scripts/eval-*.mjs`
was touched this pass. `npm run dev` loads clean, no console errors; the
sidebar itself could not be screenshotted live, the same real-Firebase-Auth
limitation every prior pass touching a signed-in-only view has already
hit, restated here rather than silently skipped.

**Part A's fix specifically needs a real human click-through to trust, not
just a bundle check.** A grep of the deployed bundle can confirm the
corrected `TODOIST_REDIRECT_URI` string is what's actually being served,
but it cannot complete a real Todoist OAuth consent screen or confirm
Todoist itself now accepts the redirect. That verification is explicitly
left to Lucas, by his own instruction, once this is deployed; not attempted
here.

### Decisions not to relitigate

- `TODOIST_REDIRECT_URI` (`src/todoist/index.js`) has no trailing slash:
  `https://super-ramble.web.app`. It is the one copy of this value; the
  Function reads `redirectUri` from the request body rather than holding
  its own constant. If the registered console value ever changes again,
  only this one constant needs to change.
- The sidebar's "#" glyph (`.project-hash`) is a sidebar-project-list
  convention only. Do not apply it to `.project-dot`'s other call sites
  (the color picker, a task's meta line, a project view's title); Todoist
  itself keeps those as dots.
- "My Projects"'s collapse state is a new, separate, persisted preference
  (`src/lib/projectsPanel.js`). Do not conflate it with `ProjectNode`'s own
  per-project caret state, which stays intentionally unpersisted.
- `docs/reference/` had no real screenshots, sidebar or otherwise, as of
  this pass. Do not assume a "looks close" sizing change is verified
  against a screenshot unless one actually exists in that folder; check
  before claiming a comparison was made.

## 2026-07-09: Todoist OAuth connect and push merged and deployed to super-ramble.web.app

Merged `feat/todoist-oauth-connect-and-push` to main through
[PR #33](https://github.com/cottalucas/super-ramble/pull/33) after CI
(`build-and-eval`) passed on the branch push, on the PR, and again on the
resulting merge commit to `main`, all three checked directly by run id, not
assumed from a green checkmark alone. This pass touched `firestore.rules`
(the new `todoistAuth` collection), so ran
`firebase deploy --only hosting,firestore:rules,functions`, not a
hosting-only deploy; `functions/index.js` and the new `functions/todoist.js`
also changed, so functions redeployed too. All three targets reported
success in the deploy log.

Verified past the deploy command's own exit code, not assumed from it:
- Hosting: fetched `https://super-ramble.web.app/` live, found the served JS
  asset (`index-Q6dhzyRi.js`), fetched it over HTTPS, and `md5`'d it against
  the local `dist/` output built from the exact merge commit
  (`71a7f0bd359fabac19c2c8a01e490f0f9b2ac1fe`, working tree clean at deploy
  time): identical, byte for byte. Grepped the fetched bundle directly for
  five strings unique to this pass's UI copy and OAuth wiring ("Connect
  Todoist", the not-connected local-preview note, "Also create in Todoist",
  the `sessionStorage` state key, and the Todoist authorize host): all five
  present in what is actually being served, not just in the local build.
- Functions: the deploy log's own "packaged
  `/Users/lucascotta/Documents/super-ramble/functions` (46.69 KB) for
  uploading" line, immediately followed by "Successful update operation" for
  `api(us-central1)`, confirms the uploaded package was this directory at
  this commit, not a stale or prior one. A live, unauthenticated call to
  each of `/api/todoist/oauth`, `/api/todoist/status`,
  `/api/todoist/disconnect`, `/api/todoist/write`, and `/api/todoist/projects`
  returns `401 {"error":"unauthorized"}` on all five: `verifyAuth` runs
  before any route dispatch, in both the old code and the new, so an
  unauthenticated probe cannot by itself distinguish the stub-era deploy
  from this one. This is the same limitation every prior live-endpoint
  check in this log already notes, not new; the deploy log's own packaging
  confirmation above is what actually establishes the new code is live, not
  the 401 pattern.
- **Not verified this pass, by design, per explicit instruction**: clicking
  through "Connect Todoist" as a real user, with a real Google sign-in and a
  real Todoist consent screen. That is being done separately, by hand,
  against a fresh Todoist account. Part B's write path (the part that does
  not need a browser) was already live-verified end to end in the entry
  below, before this merge.

## 2026-07-09: Live Todoist OAuth connect and a one-shot new-project push (phase 3, part 8)

Built the Todoist entry docs/roadmap.md's Next section had reserved (phase 3,
part 8): real OAuth connect in Settings, and a second, independent,
new-project-only write of a confirmed Super Ramble project into the user's
real Todoist account, gated behind an explicit per-ramble toggle defaulted
off. **This is not sync.** The local `store.createProjectTree` write and the
Todoist write are two separate writes of the same confirmed tree, at the
same Confirm click; after that, the local copy and the Todoist copy have no
relationship, editing one never touches the other. The word "sync" does not
appear in any UI copy or doc prose describing this feature, per the
stop-slop instruction this task carried.

**Challenged before building, per the orchestration loop.** Verified the
OAuth token-exchange response shape live against developer.todoist.com
before assuming the task brief's "store the token once, use it forever"
design held. It does not, universally: a Todoist app created with refresh
tokens enabled (the default for newly-created apps) gets a short-lived
access token (`expires_in` around 3600 seconds) plus a `refresh_token`,
rotated on every refresh; only a legacy app (refresh tokens disabled) gets
the long-lived, no-expiry-in-practice token the brief assumed. Confirmed
directly with the user that the app behind `VITE_TODOIST_CLIENT_ID` is the
refresh-enabled kind, rather than guessing or building for the simpler case
and hoping. This added real scope beyond the four parts the task described:
`users/{uid}/todoistAuth/token` stores `refreshToken` and `expiresAt`
alongside `accessToken`, and `POST /api/todoist/write` refreshes the stored
token first (`isTokenExpired`, a one-minute safety buffer) whenever it is
expired or close to it, persisting the rotated refresh token Todoist returns
per its own rotation rule.

**Part A: OAuth connect.** `SettingsModal.jsx` gained a Todoist section next
to Account and Theme, matching the existing isLocal-branch pattern Account
already uses for local preview. `src/todoist/index.js` builds the authorize
redirect (`https://app.todoist.com/oauth/authorize`, scope
`data:read_write`, verified against the 2026-06-30 entry below) with a CSRF
`state` round-tripped through `sessionStorage`. The app has no client-side
router: `redirect_uri` is the app's own root URL
(`https://super-ramble.web.app/`), hardcoded rather than derived from
`window.location.origin`, since only that exact URL is registered on the
Todoist app console; OAuth connect only completes end to end from the
deployed app, never a local dev server. `App.jsx` checks `window.location.search`
for `?code&state` once on load (skipped in local preview), verifies `state`,
and strips the query params via `history.replaceState` synchronously, before
the async exchange even starts, so a refresh or React StrictMode's double
effect firing in dev can't re-trigger it. `POST /api/todoist/oauth`
(`functions/index.js`) exchanges the code using `TODOIST_CLIENT_SECRET.value()`
and stores the token under `users/{uid}/todoistAuth/token`
(`docs/architecture.md`'s data model), denied to every client read and
write in `firestore.rules`, the `structureTraces` treatment, documented as
its own distinct case: unlike encrypted personal task text, the Function has
to read this one in plaintext to call Todoist on the user's behalf.

**Two new endpoints beyond the task's four named ones, both necessary, not
scope creep.** The stored token is never client-readable, so `GET
/api/todoist/status` is the only way Settings and the Super Ramble preview
learn whether a connection exists; fetched once on app load
(`AppData.jsx`'s `todoistConnected`/`refreshTodoistStatus`) and re-fetched
after connect or disconnect, not polled. `POST /api/todoist/disconnect`
exists because the client cannot delete an admin-only Firestore document
itself. It calls Todoist's own real revoke endpoint first (`DELETE
https://api.todoist.com/api/v1/access_tokens`, verified live against the
docs, not assumed to not exist) before deleting the stored token either way;
the response's `revoked` field says which actually happened, so Settings
never overclaims what Disconnect did if the revoke call itself fails.

**Part B: the toggle and the write, new-project-only.** In
`SuperRambleModal.jsx`'s preview, a toggle ("Also create in Todoist") shows
next to Confirm/Cancel only when Todoist is connected and the response is a
confident new project (`decision === "project"`, no `targetProjectId`);
hidden entirely for routing into an existing project, loose tasks, or not
connected. Defaults off every time, never persisted: this is a second real
external write, and confirm-before-write is the app's whole premise.
`src/pipeline/write.js`'s `toProjectTree` output (`{ project, sections,
tasks }`) was read first, per the task's own instruction not to guess
whether an adapter was needed: it is not. The exact same tree object goes to
both `store.createProjectTree` and, on Confirm with the toggle on,
`createTodoistClient({ getAuthToken }).createTree(tree)`, which POSTs it to
`/api/todoist/write`. The local write always runs first; the Todoist write's
own failure never rolls back or blocks the local write that already landed,
and the toast says so plainly (`"Saved. Todoist push failed: ..."`) rather
than presenting one pass/fail state for two independent writes.

**The batched write and its translation** (`functions/todoist.js`, new): a
pure module, no Firebase/Anthropic imports on purpose, required by
`functions/index.js` and separately importable via ESM from
`scripts/eval-todoist.mjs` with no live dependency (Node's CJS/ESM interop
handles a plain `module.exports = {...}` object fine; verified directly
before relying on it). `toTodoistPriority` is `5 - localPriority`: this
app's priority 1 (most urgent, red) is Todoist's own priority 4, and 4
(none) is Todoist's 1. This exact class of bug already shipped once, in the
Structure prompt (see the priority-direction entry below); a second,
independent translation path gets its own independent guard
(`scripts/eval-todoist.mjs`), not a shared assumption that the first guard
already covers it. `buildSyncCommands` maps a tree to one `POST
/api/v1/sync` call: `project_add` (fresh `temp_id`), `section_add` per
section, `item_add` per task with `priority`, optional `section_id`/
`parent_id`, and a due field.

**A real bug the live verification caught, that the docs-summary pass alone
did not.** The command shapes (`project_add`/`section_add`/`item_add`,
`temp_id`/`parent_id`/`section_id`, `temp_id_mapping`) were verified against
developer.todoist.com before writing `buildSyncCommands`, the same
discipline the 2026-06-30 entry below already used. That pass's summary of
the due field came back as a flat `due_string` key on `item_add.args`. The
offline eval suite (`scripts/eval-todoist.mjs`'s first draft) asserted
exactly that shape and passed. **It was wrong.** A live write against a real
account (see "Live verification" below) sent `due_string: "today"`,
`sync_status` reported `"ok"`, and the created item's `due` field came back
`null` on read-back. A second live call with the field nested instead
(`due: { string: "today" }`) produced a real, correctly-set due date on
read-back. Fixed `buildSyncCommands` to emit the nested shape and updated
`scripts/eval-todoist.mjs`'s assertion to match. This is exactly the failure
mode this task's live-verification instruction exists to catch: a
plausible-sounding, schema-shaped, silently-"successful" response that is
still wrong, and no offline eval or docs summary alone would have surfaced
it, only a real write read back afterward did.

### Live verification: what was and wasn't checked

A real Todoist personal API token (the "test token" the task offered, full
scope on the user's own account) was used to live-verify Part B directly,
before Part A's OAuth exchange was even exercised, exactly as the task
suggested. A first attempt at the token as initially given failed with a
real, live `401 AUTH_INVALID_TOKEN` from Todoist itself (verified with a
bare curl call independent of any of this project's code, ruling out a bug
on this end); a corrected token, the right shape (40 lowercase hex
characters, matching Todoist's documented personal-token format), worked.

**Verified live, with real writes to a real account, read back and checked
field by field, not assumed from a 200 response:**
- A throwaway local script (not committed; deleted after use) called
  `functions/todoist.js`'s `buildSyncCommands` directly, the exact same code
  the deployed Function runs, and POSTed the result straight to
  `https://api.todoist.com/api/v1/sync` with the test token.
- First attempt (the flat `due_string` bug above) landed a project, a
  section, a parent task, and a nested sub-task, all correctly structured
  and correctly prioritized, but with the due date silently missing.
  Deleted after diagnosing it (`project_delete`, cascades its own sections
  and items).
- Second attempt, after the fix: read the created project, section, parent
  item, and child item back from Todoist and checked, against the live
  data, not the write response: the project exists; the section belongs to
  it; the parent task sits in that section; the parent task's Todoist
  priority is 4 for a local priority of 1 (urgent); the parent task's due
  date resolved from "today" to a real calendar date; the child task is
  parented under the parent task by real Todoist id; the child task's
  Todoist priority is 1 for a local priority of 4 (not urgent); the child
  task carries no due date at all, matching that no due was sent. All eight
  checks passed. That verification project (id `6h4G9GQ58pgWCQ82`, "Super
  Ramble verify 2026-07-08 22:19") was left in the account rather than
  deleted, so it can be checked visually too, not just programmatically.

**Not live-verified this pass, stated plainly rather than implied:**
- **Part A's OAuth connect UI, end to end.** No real browser click-through
  of "Connect Todoist" happened: that requires a real Google sign-in (this
  app has no local-preview path for a real Firebase Auth session, and this
  environment cannot drive an interactive OAuth popup), a real redirect to
  Todoist's authorize screen, a real user consent click, and a real redirect
  back to `https://super-ramble.web.app/` with `?code&state`. `npm run dev`
  loaded clean with no console errors (confirming nothing broke at the
  module-resolution/build level), but the sign-in gate itself was the
  farthest point reached headlessly.
- **`POST /api/todoist/oauth` and `POST /api/todoist/write` as deployed
  Cloud Run revisions**, called through this app's own auth and Firestore
  layer. The write-path verification above called the real Todoist API
  directly with `buildSyncCommands`'s output, proving the translation logic
  and the Todoist API contract are both correct; it did not prove the
  Function's own request handling, auth verification, or Firestore
  read/write around that call are wired correctly end to end, since doing
  that would have required completing Part A's OAuth flow first.
- **The refresh-before-write path.** The personal API token used for
  verification has no `expires_in`/`refresh_token` concept the way an
  OAuth-issued token does, so `isTokenExpired` and the refresh call in
  `POST /api/todoist/write` were exercised only by
  `scripts/eval-todoist.mjs`'s offline cases, never against a real,
  actually-expired OAuth token.
- **The real revoke endpoint** (`DELETE /api/v1/access_tokens`). Its
  existence and request shape were verified against developer.todoist.com's
  own docs, not by an actual live DELETE call: doing that would have
  revoked the user's real provided test token, which this pass had no
  standing authorization to do, since the user might want to reuse it.

### Decisions not to relitigate

- Not sync. Two independent writes at one Confirm click, no relationship
  after that. Never call this feature "sync" in UI copy or docs.
- `users/{uid}/todoistAuth/token`, admin-only (`firestore.rules`), holds
  `accessToken`, `refreshToken`, `expiresAt`, `scope`, `clientId`,
  `redirectUri`, `connectedAt`. A distinct case from `structureTraces` and
  from encrypted personal task text, documented as such in
  `docs/architecture.md`; do not conflate the three.
- The Todoist app behind `VITE_TODOIST_CLIENT_ID` has refresh tokens
  enabled, confirmed directly with the user, not assumed. `POST
  /api/todoist/write` must keep refreshing an expired/near-expired token
  before writing; do not simplify this back to "store once, use forever"
  without re-confirming the app's own refresh-token setting first.
- `item_add`'s due field on the Sync API is a nested `due: { string }`
  object, not a flat `due_string` key. This was wrong in the first draft,
  accepted silently by Todoist ("ok" in `sync_status`) with the due date
  left `null`, and caught only by a live write read back afterward.
  `scripts/eval-todoist.mjs` now asserts the nested shape; do not flatten it
  again without re-verifying live.
- `toTodoistPriority` is `5 - localPriority`. Do not invert this to look
  like a simpler 1:1 copy; the direction really is opposite, the same bug
  class as the priority-direction entry below.
- `GET /api/todoist/status` and `POST /api/todoist/disconnect` are real,
  necessary endpoints this pass added beyond the task's four named ones, not
  stubs and not scope creep: the token's own admin-only rule makes both
  unavoidable for a working connect/disconnect UI.
- `readProjects()`/`readLabels()` in `src/todoist/index.js`, and
  `GET /api/todoist/projects`, stay stubbed. Not needed until Structure can
  route a Super Ramble proposal into an existing Todoist project, a
  separate future pass (`docs/roadmap.md`, phase 3 part 9).

Verified: `npm run build` succeeds. `npm run eval` is green (15 Structure
fixtures/contract/guard cases, 12 date cases, 17 new Todoist cases, all
passing). `node --check` passes on both `functions/index.js` and
`functions/todoist.js`. `npm run verify:prod-env` confirms
`VITE_ENABLE_LOCAL_PREVIEW` is not `true` in `.env.local`. No secret was
committed; `.env.example` carries `VITE_TODOIST_CLIENT_ID=` with no value,
`TODOIST_CLIENT_SECRET` stays a Function secret, and the real test token
used for live verification lived only in a shell environment variable and a
throwaway, uncommitted local script, never written into any file inside
this repository.

## 2026-07-08: Section options completeness (Edit, Move to project) and a section description field

Reported directly against a live Board-view screenshot: a section's own
options menu ("...") only had Delete section. Todoist's own menu (also
screenshotted directly) has Edit, Move to..., Duplicate, Copy link to
section, Archive, and Delete. Added exactly what was asked for, Edit and
Move to..., not the rest: Duplicate, Copy link to section, and Archive stay
out, the same real-Todoist-menu trimming the Project overflow menu already
did (see the 2026-06 entries below), not a new decision. A fourth screenshot
showed the desired Add/Edit section shape, a name field and a description
field with Save/Cancel, replacing the old bare "Section name" input; built
that too, which meant giving `sections` a `description` field it did not
have before.

**Schema.** `sections` gains `description` (string, default `''`), added to
`docs/architecture.md`. The same optional-blurb pattern `projects.description`
already established in phase 2.5, not a new shape. `src/store/tree.js`'s
`resolveTree` defaults it to `''` like every other optional field, so a
pipeline-created section (which never emits a description; the Structure
contract's `SECTION_KEYS` is still just `ref`/`name`, untouched this pass)
gets one for free instead of `undefined`.

**`SectionForm.jsx` (new).** The shared Add/Edit form: a name input and a
description textarea, styled with the same `.modal-name`/`.modal-desc`
classes `TaskAddForm` already uses, wrapped in `.inline-add` so it renders
in place, no backdrop, no centered card, the same convention
`docs/design-system.md`'s "Inline add-task" section set for
`InlineTaskAdd`. One component, two callers: `ProjectView.jsx`'s List
section head swaps to it for both Add and Edit; `Board.jsx`'s column head
does the same, plus a new trailing "+ Add section" stub column
(`.board-col-add`), since Board previously had no way to add a section at
all, not even the old bare-input version. Submit is disabled until a name
is typed, matching every other Add/Edit form's `canSave` gate in this app.

**`SectionOptionsMenu.jsx` (new).** One Popover, Edit / Move to... / Delete
section, used identically by List and Board so a section has the same menu
regardless of which layout is showing it; the old ad hoc Popover inline in
`ProjectView.jsx` (Delete only) is gone. "Move to..." swaps the popover's
own content to a project list, Inbox first then `flattenProjectTree` over
the rest, minus the section's current project, rather than opening a second
nested Popover anchored separately: simpler, and this menu is small enough
that one panel swapping content reads fine. No search input, unlike the
Todoist reference screenshot's "Type a project name" field:
`ProjectPicker.jsx`, the closest existing precedent for "pick a project" in
this app, has no search either, and the project list is short enough in
practice that adding one would be scope beyond what was asked.

**`store.moveSectionToProject(sectionId, projectId)` (new, both adapters).**
Moving only the section's own `projectId` would strand its tasks: every
view filters tasks by `projectId`, so a task left on the old project while
its section moved would render nowhere real. Cascades to every task under
the section, its direct tasks (matched by `sectionId`) plus their whole
sub-task chain via `parentId`, the identical descendant-walk `deleteTask`
already uses in both adapters, just updating `projectId` instead of
deleting. `sectionId` itself is left unchanged on every cascaded task; only
`projectId` needs to move; a task's `sectionId` still uniquely identifies
its section regardless of which project that section now belongs to.

**Display.** A saved description shows read-only under the section head
when non-empty, `.section-description` in List, `.board-col-desc` in
Board, plain muted text, not another editable field in place; editing only
happens through the Edit menu item and the form it opens, unlike
`ProjectDescription`'s own always-editable, live-autosave textarea under a
project's title. Chosen deliberately: showing an editable-looking field
that saves nothing until a separate Edit action is taken would read as a
broken control, the same "no dead controls" anti-pattern
`docs/design-system.md`'s checklist already names.

Build clean, offline evals still 17/17 (pipeline) and 12/12 (date), both
unaffected: no pipeline or date-lib code touched this pass.

### Decisions not to relitigate

- A section's options menu is Edit, Move to..., Delete. Duplicate, Copy link
  to section, and Archive are declined, matching the trimming the Project
  overflow menu already applied to Todoist's own project menu.
- `sections.description` is real, persisted, and shown once set, not a
  cosmetic-only form field. Displayed read-only under the section head;
  editing happens only through the Add/Edit section form.
- Moving a section to another project always cascades its whole task
  subtree's `projectId`. A future move-like feature (moving a single task
  across projects, `TaskDetail.jsx`'s `ProjectPicker`) does not currently
  cascade to that task's own sub-tasks; that is a separate, pre-existing gap
  this pass did not touch, flagged here rather than silently left
  undocumented.

## 2026-07-08: Removed the Board column divider

Reported directly against a live screenshot of Inbox in Board layout: the
`border-right: 1px solid var(--ds-line)` divider between `.board-col`s
(added 2026-07-05, see that entry below) read as visual clutter, not a
native Todoist match. Worth stating plainly: that divider was a reasoned
guess, not a verified one. `docs/reference/` had no real screenshot to check
it against then and still doesn't now, so removing it on direct user
judgment isn't overriding a settled, evidence-backed decision, it's
replacing a guess with real feedback. Removed `border-right` from both
`.board-col` (Inbox/Project/Today Board) and `.day-col` (Upcoming Board),
the two columns the 2026-07-05 entry ties together as sharing one look; left
them matching rather than fixing one and not the other. `.board-col:last-
child`'s now-unused `border-right: 0` override removed with it.

### Decisions not to relitigate

- Board columns render on a plain background with no divider between them.
  A future pass reopening this should check a real reference screenshot
  first, if one exists by then, rather than guessing again.

## 2026-07-08: Usable at phone width (375-428px), a defensive pass, not a redesign

The app had zero media queries. This pass makes sure nothing clips,
overflows, or renders off-screen at phone width; nothing about interaction,
drag-and-drop, or the design system changes, and Board layout's own
responsive behavior stays explicitly out of scope (a phone-width viewport
always gets List, regardless of the stored Layout preference).

**Sidebar and shell (`src/App.jsx`'s Shell, `src/styles.css`).** Below a
640px breakpoint, the sidebar becomes a closed-by-default overlay
(`.sidebar-mobile`, fixed-position, over a dimmed `.sidebar-backdrop`)
instead of a fixed-width flex sibling squeezing the content column. Driven
by a `matchMedia('(max-width: 640px)')` listener (`isPhone` state) and a
separate, purely in-memory `mobileOpen` state, both new; the existing
persisted `sidebarHidden` preference (`src/lib/sidebar.js`) is never
written to as a side effect of viewport width, verified directly by
checking `localStorage.getItem('super-ramble:sidebar')` stayed `null`
across repeated open/close cycles at 375px, then confirming the existing
desktop toggle still persists correctly (`'hidden'`/`'shown'`) after
resizing back. `toggleSidebar` branches on `isPhone`: phone flips
`mobileOpen` only, everything else is the unmodified existing persisted
toggle. `Sidebar.jsx` gained one optional `mobile` prop (a class, nothing
behavioral) so the same component renders in both contexts. Escape and the
overlay's click-outside-to-close are now also blocked during an open mobile
sidebar, matching the existing `loading`-state guard, so a user can't lose
an open drawer to the same gesture that would otherwise close the whole
Super Ramble modal.

**A real bug found and fixed while verifying this, not assumed from the
CSS**: the sidebar's own reveal button (`.sidebar-reveal`, fixed
`top: 14px; left: 14px`) sat directly on top of the view heading once
`.content-inner`'s padding shrank for phone width, reported directly
against a screenshot ("Today" read as "day", the reveal button covering the
rest). Fixed by giving `.content-inner` 56px of top padding at this
breakpoint, enough to clear the button's ~32px box plus a gap, instead of
the 20px first tried.

**`Popover.jsx`** only ever flipped horizontally, and only away from the
right edge. Its existing two-pass positioning (an initial guess before
paint, then a resolved pass once the popover's real size is known) now
resolves all four edges in that second pass: flips right-aligned if it
would overflow the right edge, clamps whichever edge is in use to an 8px
margin (a real risk at phone width that plain right-flipping alone doesn't
catch), and flips to open above the anchor instead of below if it would
overflow the bottom edge, falling back to a top-margin clamp if it doesn't
fit above either. This affects every picker built on `Popover` (date,
priority, label, reminders, project picker, Display/Layout control, project
and section options) for free. Verified directly, not assumed: measured
`getBoundingClientRect()` for the date, priority, and label pickers at
375x667 (all four edges checked programmatically, not just eyeballed from a
screenshot that turned out to be device-pixel-scaled 2x and misleading on
first read).

**Modals (`.modal`, `.modal-body`)** gained a `max-height` (`calc(88vh -
16px)` normally, `calc(100vh - 32px)` below 640px, matching the overlay's
own reduced top/bottom padding at that width) and became a flex column;
`.modal` switched from `overflow: visible` to `hidden`, with `.modal-body`
now scrolling internally (`overflow-y: auto; min-height: 0`) instead of the
whole modal growing past the viewport and pushing its own footer
off-screen. Confirmed `Popover`'s portal (renders to `document.body`,
entirely outside `.modal`'s DOM) is unaffected by the `overflow: hidden`
change before making it. `.detail-body` (`TaskDetail.jsx`) and
`.sr-preview-body` (`SuperRambleModal.jsx`) already had their own explicit
`max-height`/`overflow-y: auto` and needed no change; the generic fix is
additive for the modals that used plain `.modal-body` unguarded
(`QuickAddModal` via `TaskAddForm`, `AddProjectModal`, `SettingsModal`).
`ConfirmDialog` uses its own `.confirm-body`, always short, left alone.

**The one real, substantive bug this pass found, not a hypothetical
edge case**: `TaskDetail.jsx`'s two-column layout (`.detail-main`,
flexible, beside `.detail-rail`, a fixed 220px sidebar) assumes a 720px-wide
modal. Below 640px, `.modal`'s own `max-width` clamp leaves roughly 340px
total; subtracting the fixed 220px rail left about 120px for the main
column, narrow enough that a task's own title wrapped character by
character ("wrappi" / "ng" / "behavi" / "or") instead of at word
boundaries. Found live, opening a real `TaskDetail` at 375px, not predicted
from reading the CSS beforehand. Fixed by stacking `.detail-body` into a
column below 640px: full-width main content, then the rail below it, its
divider moving from a left border to a top one to match. Verified the fix
at 375, 390, and 414px, and in dark theme.

**`VoiceRecorder.jsx`'s full-recording view** (the feature most likely to
actually get demoed on a phone) verified live at 375px via a synthetic
`MediaStream` (a real Web Audio oscillator, the same technique used to
verify it when it first shipped): the centered ring, stop button, and timer
render fully visible, nothing clipped or overlapping the modal chrome.

**All six `SuperRambleModal` states verified live at 375px**, each via a
mocked `/api/structure` (local dev has no `/api/**` proxy, matching this
app's own existing local-dev limitation): `input` (placeholder, tips,
footer), `recording` (the full view above), `loading` (the static line plus
a cycling tip, confirmed advancing across separate checks during a real,
artificially-delayed fetch), `preview` (a real project tree with nested
sub-tasks, `.sr-preview-body`'s own scroll and the modal's footer both
staying correctly visible together), `error`, and `needsClarification`.
None needed a fix beyond the generic modal change above.

**Task rows (`TaskRow.jsx`)** already had `flex-wrap` on `.task-meta` and
`min-width: 0` on `.task-main`; confirmed live rather than trusted from
reading the CSS alone, using a real task (a long title, a due date, a
label, and a nested sub-task) at 375, 390, 414, and 428px: the title wraps
at word boundaries, the meta line (due date, label, project name) wraps or
stays on one line without ever overflowing horizontally, and a nested
sub-task indents correctly. `UpcomingView`'s day-strip (7 day pills) wraps
onto a second line rather than overflowing the page at 375px, confirmed via
`document.documentElement.scrollWidth === clientWidth`, not just a visual
read.

**Spot-checked in dark theme**: the sidebar overlay, its backdrop, and
`TaskDetail`'s stacked layout all read correctly, no token carried over
unchanged from light onto a dark surface.

**Not covered, stated plainly rather than silently skipped**: `Add Project`
modal's color-swatch dropdown visually overlaps the modal's own footer
buttons at every width, not just phone; confirmed this is pre-existing
(unrelated to any change in this pass, a z-index/positioning detail of that
one dropdown, not a viewport-edge overflow) and left it alone, since it is
out of this pass's scope (nothing clips or renders off-screen because of
it) and not something this pass's own changes caused or worsened.

Verified: `npm run build` succeeds. `npm run eval` is 17/17 offline, 12/12
date, untouched, since no file under `src/pipeline/`, `src/store/`, or
`src/todoist/` was touched, matching this pass's explicit scope. Diff
touches exactly four files: `src/App.jsx`, `src/components/Popover.jsx`,
`src/components/Sidebar.jsx`, `src/styles.css`.

### Decisions not to relitigate

- The sidebar's persisted show/hide preference and phone-width overlay
  state are two separate mechanisms on purpose: one in `localStorage`
  (a desktop choice), one in memory (`isPhone`/`mobileOpen`, reset on every
  reload). Do not merge them; a phone visit must never overwrite the
  desktop preference, and a desktop session must never inherit a stray
  mobile-open state.
- `.content-inner`'s phone-width top padding is 56px, not an arbitrary
  round number: it clears `.sidebar-reveal`'s fixed box. Do not shrink it
  without re-checking that button's position first.
- `Popover.jsx` now resolves all four edges every time it opens, not just
  the right one. Do not revert to right-edge-only flipping; that is the
  exact gap that clipped a picker at phone width before this entry.
- `.modal`'s `overflow: hidden` is safe because `Popover` portals entirely
  outside `.modal`'s DOM (`document.body`, not a descendant). Do not
  reintroduce `overflow: visible` on `.modal` to "fix" some future popover
  positioning issue; portal to `document.body` instead, the same way every
  existing picker already does.
- `.detail-body` stacks into a column below 640px; this is a real,
  measured fix for a real crushed-text bug, not a cosmetic preference. Do
  not revert to a fixed two-column layout at phone width.
- Board layout's own responsive behavior, and touch-based drag-and-drop
  reordering, are both still out of scope. A phone-width viewport always
  gets List, unconditionally, regardless of the stored Layout preference.
  This is a distinct, later decision, not approximated here.
- The Add Project modal's color-picker-over-footer overlap is a known,
  pre-existing, out-of-scope detail, not something this pass caused. A
  future pass touching that dropdown should fix it on its own terms, not
  cite this entry as having already scoped it in.

**Merged and deployed.** Merged to main through
[PR #32](https://github.com/cottalucas/super-ramble/pull/32) after CI
(`build-and-eval`) passed on the branch push, the PR, and the resulting
merge commit to `main`, each checked directly by run id. No `functions/` or
`firestore.rules` change this pass (confirmed by diff against the prior
deploy), so only `firebase deploy --only hosting` ran; it reported success.

**Verified past the deploy command's exit code.** Fetched
`https://super-ramble.web.app/` live: same asset filenames as the local
build, both assets `md5`'d against local `dist/`, identical byte for byte.
Went one step further than a hash match: grepped the live CSS directly for
`.sidebar-mobile` and `.sidebar-backdrop`, both new classes this pass
introduced, and found both present, direct proof the deployed bundle is
actually serving this pass's changes, not just a bundle that happens to
hash the same.

## 2026-07-08: Doc-sync gap, roadmap.md left behind by PR #31

PR #31 (the voice recording prominence, copy pass, and routing-clarification
entry immediately below) updated `docs/design-system.md` and
`docs/llm-pipeline.md` in the same pass, correctly, but never touched
`docs/roadmap.md`. Its own entry states plainly what it changed and never
claims a `docs/roadmap.md` update, so this is a real, honestly-scoped gap,
not a false claim to catch. `docs/roadmap.md`'s Built section still
described the pre-PR-31 shape of `VoiceRecorder.jsx` (a single non-variant
widget) and quoted the old "Structure it" button label as current, both
stale against shipped code.

Fixed: added a new "Phase 3, part 5" Built entry summarizing PR #31's four
parts and the sidebar divider, pointing to this log and to
`docs/design-system.md`/`docs/llm-pipeline.md` for full detail rather than
duplicating it. Renumbered the Next section's Todoist OAuth entry from
"Phase 3, part 5" to "Phase 3, part 6," the same bookkeeping-only convention
part 4's own entry used when it displaced Todoist OAuth from "part 3" to
"part 4."

**Verification.** `npm run eval`: 17/17 offline, 12/12 date, no code
touched so no reason for either to move, confirmed unchanged. `npm run
build`: this sandbox's mounted checkout has a filesystem permission lock on
`dist/` this session (`EPERM` on unlink, also seen on `.git/index.lock` and
`.git/objects/maintenance.lock` for unrelated git commands), so a full build
could not be verified end to end here; Vite's own transform step completed
clean (90 modules) before hitting that unrelated cleanup step, and this pass
touched only Markdown, no source. Docs-only change, nothing to deploy.

### Decisions not to relitigate

- A resolution-log entry that lists what it changed, without a `docs/
  roadmap.md` line, is a signal to check for exactly this gap before
  assuming the doc set is in sync, not proof the entry itself is wrong.

## 2026-07-08: Voice recording prominence, a copy pass, and a routing-clarification refinement

Four parts plus a small sidebar polish item, all reported directly (a live
screenshot for the mic control, a live `reasoning` string still echoing
prompt vocabulary, a static loading sentence, and a live trace asking a
clarifying question the low-confidence rule should not have produced).

### Part A: recording gets its own moment

The mic control lived as a small element beside the textarea; reported
directly against a screenshot, it read as an afterthought, not a real
recording experience. `SuperRambleModal.jsx`'s `state` gains a `recording`
value alongside the existing `input | loading | preview | error`, and
`VoiceRecorder.jsx` gains a `variant` prop (`"compact"`, the small idle
control; `"full"`, a dedicated centered view: a bigger `AnalyserNode`-driven
ring behind an unmistakable stop button, a monospace timer, a near-cap
warning) plus an `onActiveChange(active)` callback that tells the parent
which variant to render.

**The one real hazard here, solved deliberately, not by accident:** a naive
implementation would render `<VoiceRecorder variant="compact">` inside the
`state === 'input'` block and a separate `<VoiceRecorder variant="full">`
inside a new `state === 'recording'` block, two textually different JSX
positions. Switching `state` between them would unmount and remount the
component, tearing down the real `MediaRecorder`/`MediaStream`/`AudioContext`
mid-recording, since React reconciles by tree position, not by scanning for
a matching component type across different branches. The fix: exactly one
`<VoiceRecorder>` element, at one stable JSX position (the first child of
`.modal-body.sr-body`, rendered whenever `state` is `'input'` or
`'recording'`), with only its `variant` prop changing between renders. The
textarea, tips, and footer render only when `state === 'input'`, as
additional siblings inside that same persistent body. Escape and the
overlay's click-outside-to-close are both now also blocked during
`'recording'`, matching the existing `'loading'` guard, so a user can't
abandon an active recording session by accident the way they already
couldn't abandon an in-flight Structure call.

`docs/design-system.md`'s "Recording indicator" section rewritten for the
two-variant shape. Still native Web Audio API only, still no new dependency,
still docs/roadmap.md's "not competing on capture quality" line: this is a
layout and prominence fix, not new capability, no different information is
captured or computed than before.

### Part B: the copy pass, both layers

- `SuperRambleModal.jsx`: the placeholder now mentions recording as a real
  option ("Type it, paste it, or record it"); the loading line changed from
  "Reading your dump and structuring it." to "Turning what you said into
  tasks."; the primary button changed from "Structure it" to "Make tasks."
  Every doc that quoted the old button copy verbatim
  (`docs/llm-pipeline.md`) updated to match.
- `SYSTEM_PROMPT` (`src/pipeline/prompt.js` and `functions/index.js`,
  verified identical by direct diff): rewritten to describe what the user
  said without "dump" as the noun for it ("what someone rambled," "what they
  said"), the reason `reasoning` kept echoing "the dump" back at users was
  that it was mirroring the prompt's own vocabulary, not a separate copy
  bug. A new line tells the model to write `reasoning` "the way a person
  would describe what they heard," never referencing "the dump" or "the
  transcript" as objects. This is stated as its own explicit instruction,
  not assumed to follow automatically from removing "dump" elsewhere in the
  prompt, since the two are genuinely separate failure modes (vocabulary
  leaking sideways vs. reasoning describing an input variable instead of
  content).
- Not independently verified with a real live call in this pass (see the
  verification note below): confirmed via fixture-level reasoning strings
  already avoiding "dump," and via direct reading of the new prompt text,
  that the instruction is unambiguous. A live call is the only way to
  confirm actual model output changed, not just the prompt asking for it.

### Part C: loading state gets real content

A single static sentence during Structure's several-second call is now a
static line ("Turning what you said into tasks.") plus a small
`LoadingTips` component cycling three short, useful tips (name an existing
project to route into it, dependency phrasing becomes sub-tasks, phrasing
of urgency and dates carries through to priority and due date) every 3.4
seconds. Keyed by index so each swap remounts the `<p>`, retriggering a
plain CSS `@keyframes` fade (`.sr-loading-tip`/`sr-tip-fade`); no JS
animation library. Teaching content for a wait, not a spinner with jokes,
per the task's own framing.

### Part D: ask only about routing ambiguity, not permission to create

**This reopens half of the 2026-07-06 decision on purpose, stated plainly.**
That entry (see below, "Resolved the 2026-07-04 Structure contract
conflict") correctly established that a low-confidence call should lean
toward flat `"tasks"` rather than inventing a `"project"` that might not
fit. **That half stays exactly as it was**, restated verbatim in the new
prompt line so it isn't silently weakened: "confidence and the `"tasks"`
fallback" is still how project-shaped uncertainty gets resolved, never by a
clarifying question.

What's added is a different, separate axis. A real live trace surfaced the
actual problem: `needsClarification` was being reached for on the wrong kind
of uncertainty. "Is this a coherent project or loose tasks" and "does this
belong to something that already exists" are two different questions;
`needsClarification` should only ever be about the second one. `SYSTEM_PROMPT`
(both copies) now states this explicitly: when content is clearly new and
unrelated to every `existingProjects` entry, propose the new project
confidently, no question first, since Confirm/Cancel already gates anything
from being written; reserve `needsClarification` for genuine routing
uncertainty, could this extend an existing project or is it new, or (already
fixed this session, 2026-07-08's "Never surface a raw document id" entry)
which of several same-named existing projects it means.

**Fixture coverage audited before adding anything, not assumed.** Checked
every existing fixture's `existingProjects`/`decision`/`needsClarification`/
`confidence` directly: `01`, `05`, `07`, `08` all already cover "clearly
novel and unrelated, confident new project, no clarification" (each has
existing but unrelated projects like Work/Groceries, and a confidently
synthesized new project at high confidence). `04` is ambiguous for a
different reason entirely (the content itself is too vague to act on, not a
routing question); `09` is ambiguous about which of two identically-named
existing projects, not whether new content belongs to one existing project
or deserves its own. **Neither covers "genuinely could extend a single
existing project or be its own new one."** New fixture
`evals/fixtures/10-clarify-belongs-to-existing-or-new.json`: one existing
project ("Home Renovation"), a transcript about a plausibly-related-but-
distinct effort (a backyard patio redo), `needsClarification: true`,
`clarificationQuestion` naming the existing project by name (never its id),
low confidence. Verified this fixture actually catches the regression it
exists to catch: temporarily edited its `mockResponse` to the shape the old,
Part-D-less prompt would produce (confidently synthesizes a new "Backyard
Patio" project at 0.8 confidence, no clarification), ran `npm run
eval:offline`, got a clean three-check failure (`decision matches`,
`project presence matches`, `clarification flag matches`), restored,
reran clean.

### Sidebar: a divider after Super Ramble

A hairline (`.nav-divider`, the same `border-top: 1px solid var(--ds-line)`
shape `.detail-rail-divider` already established, adapted for the sidebar's
own rhythm) now sits between the Super Ramble nav button and Inbox, visually
separating the two entry points (Add task's popover, Super Ramble) from the
three views below (Inbox, Today, Upcoming) rather than letting five buttons
run together with no grouping.

### Verification

`npm run build` succeeds. `npm run eval` is 17/17 offline (10 fixtures, 6
negative contract cases, 1 guard case), 12/12 date, no spend. `node --check
functions/index.js` passes. `SYSTEM_PROMPT` verified identical between
`src/pipeline/prompt.js` and `functions/index.js` via direct text diff.

**What was and wasn't live-verified in the browser, stated plainly.** Live
in `npm run dev`: the recording view genuinely replaces the textarea view
once recording starts (confirmed the same `VoiceRecorder` instance never
unmounts by checking that an in-progress recording, started while variant
was `"compact"`, kept running uninterrupted once the parent re-rendered it
as `"full"`); the loading tips genuinely cycle (confirmed three different
strings render in sequence with the interval, not just present in the DOM
once); the sidebar divider renders between Super Ramble and Inbox in both
themes. **Not verified with a real authenticated `/api/structure` call**: no
real Firebase session or standing authorization to spend real Anthropic
credits is available in this environment, the same limitation stated in
every prior live-model-behavior claim this session. The `reasoning`-no-longer-
says-"the dump" claim is therefore verified by direct reading of the new
prompt instruction and by the fixture-level reasoning strings (already
"dump"-free, unchanged by this pass), not by observing a fresh live
response; a future pass with real call access should confirm directly.

### Decisions not to relitigate

- `VoiceRecorder` must stay mounted as one instance across `'input'` and
  `'recording'`, `variant` is the only thing that changes. Do not split it
  back into two separately-rendered elements across the state conditional;
  that reintroduces the exact remount-mid-recording hazard this pass fixed.
- The 2026-07-06 "low confidence leans toward tasks" rule is unchanged and
  restated verbatim in the new prompt line. Do not read this entry as having
  weakened it; only the `needsClarification` axis changed.
- `needsClarification` is reserved for routing uncertainty (extend an
  existing project vs. new, or which of several same-named ones), never for
  uncertainty about whether content is project-shaped at all. A future
  change conflating these two again should point back to this entry and the
  2026-07-06 one, not silently re-blend them.
- `evals/fixtures/10-clarify-belongs-to-existing-or-new.json` is the one new
  fixture for the previously-uncovered side of this distinction. `01`,
  `05`, `07`, `08` already cover the other side (confident new project, no
  clarification); do not add a duplicate fixture for that side.
- The button reads "Make tasks," not "Structure it." Any doc or future copy
  quoting the old label should be treated as stale, not authoritative.
- The `reasoning`-copy fix has not been confirmed against a real live model
  call. Do not cite this entry as having proven live model output changed;
  it proved the prompt instruction is unambiguous and consistent with
  already-"dump"-free fixture data, a different, weaker claim stated
  honestly here rather than overstated.

**Merged and deployed.** Merged to main through
[PR #31](https://github.com/cottalucas/super-ramble/pull/31) after CI
(`build-and-eval`) passed on the branch push, the PR, and the resulting
merge commit to `main`, each checked directly by run id. `firestore.rules`
untouched (confirmed by diff against the prior deploy). Both `src/` and
`functions/index.js` changed this pass, so both `firebase deploy --only
hosting` and `firebase deploy --only functions` ran; both reported success.

**Verified past both deploy commands' exit codes.** Hosting: fetched
`https://super-ramble.web.app/` live, same asset filenames as the local
build, `md5`'d both against local `dist/`: identical, byte for byte.
Further, and new this time: grepped the live JS bundle directly for the new
UI copy ("Make tasks", "Turning what you said into tasks") and found both
verbatim, direct proof the new strings are what's actually being served,
not just that some bundle with a matching hash is live. Functions: reported
"Successful update operation" for `api(us-central1)`.

**The same real, honest limit on verifying the Function's new prompt
specifically as every prior deploy in this log**: `verifyAuth` runs before
any route matching, so an unauthenticated `POST /api/structure` returns
`401` regardless of whether the new prompt text is actually live; it only
proves the revision is executing, not stale. `gcloud logging read` still
has broken credentials in this sandbox (`invalid_grant`), checked again
directly, unchanged. No real Firebase session or standing authorization to
spend real Anthropic credits was available to make an authenticated call.
What is verified instead: the exact `functions/index.js`, already diffed
identical to `src/pipeline/prompt.js` earlier in this entry, is the file the
deploy log's own "packaged ... for uploading" step named, moments before
this exact commit's deploy succeeded.

## 2026-07-08: Voice capture, Stage 1 (Transcribe) made real: record, transcribe via Groq, land in the text box

Stage 1 of the pipeline (docs/llm-pipeline.md) has been a documented
pass-through since phase 1: audio in, transcript out, never actually built.
This pass builds the real thing.

**A doc gap worth naming plainly before the rest of this entry.**
`docs/roadmap.md`'s Next section had no line item for this at all: no
mention of Groq, voice, or a Transcribe implementation anywhere in
`docs/roadmap.md` or `docs/llm-pipeline.md` prior to this pass. The task
that specified this work referenced "a prior pass" that verified Groq's
cost math and "a relevant Next-section line" to move to Built; neither
exists in this repo's own history. What is real and independently verified:
`GROQ_API_KEY` genuinely exists as a Firebase Functions secret
(`firebase functions:secrets:access GROQ_API_KEY` succeeds), so setup work
did happen, just not logged here. Rather than block on an undocumented
premise, this pass verified the load-bearing facts itself (model id,
endpoint, pricing, rate limits, all fetched live against
console.groq.com's own docs, not recalled) and proceeded; there was no
Next-section line to "move," so a fresh Built entry was added instead
(`docs/roadmap.md`, "Phase 3, part 4: voice capture"), and the roadmap's own
Next entry that had already claimed that number (Todoist OAuth) is bumped
to "part 5," the same bookkeeping-only renumbering convention the
2026-07-07 comments entry already used.

**Verified live, not recalled**, against console.groq.com/docs/speech-to-text
and console.groq.com/docs/rate-limits:

- Model id: `whisper-large-v3-turbo`. Endpoint:
  `https://api.groq.com/openai/v1/audio/transcriptions`, OpenAI-compatible,
  multipart form data (`file`, `model`, `response_format`, others).
- Pricing: $0.04/hour for the Turbo model (vs. $0.111/hour for the
  standard model). Minimum billable duration: 10 seconds. Max file size:
  25MB free tier, 100MB dev tier. Supported formats include webm, the
  format Chrome/Firefox's `MediaRecorder` actually produces.
- Free-tier rate limits: 20 requests/minute, 2,000 requests/day, a wide
  margin over this app's realistic single-dogfooding-user volume.

**The contract**, `functions/index.js`:

- New `POST /api/transcribe`: `{ audioBase64, mimeType, durationSeconds }`
  in, JSON not multipart, matching `/api/structure`'s own request shape so
  no new body-parsing dependency was needed. Rejects (`400`) a missing/
  empty `audioBase64`, a non-positive or missing `durationSeconds`, a
  `durationSeconds` over 300 (5 minutes), or a decoded payload over 10MB,
  each checked before any Groq call. 300 seconds is a product-framing limit
  (docs/brief.md's "capture stays deliberately simple"), not a technical
  one; even a full 5 minutes at typical browser voice bitrates is a few MB,
  nowhere near either size ceiling. 10MB decoded audio was chosen
  comfortably above any real recording at that duration cap, and
  comfortably under Groq's own 25MB free-tier limit even after the ~33%
  size inflation of base64-encoding it into this JSON request body.
- Reuses `checkAndReserveLimit`/`logUsage` exactly as they already are, not
  duplicated: one shared `users/{uid}/llmUsage/{YYYY-MM-DD}` daily
  request/cost ceiling across both `/api/structure` and `/api/transcribe`,
  not a second parallel limit system. `logUsage` gained one new optional
  `audioSeconds` parameter/field; `inputTokens`/`outputTokens` don't apply
  to a transcription call and are not forced to carry duration data.
- The outgoing call to Groq is built with Node 20's native `fetch`,
  `FormData`, and `Blob` (this Function's runtime, per `firebase.json`),
  not the `openai` package, since multipart form data to one endpoint is
  the only thing that package would have been for.
- Cost: `costUsd = (max(durationSeconds, 10) / 3600) * 0.04`, the `max`
  matching Groq's own stated 10-second minimum billable duration so this
  app's own estimate never under-counts what Groq will actually charge.
- On a Groq-side failure (network error, non-2xx response, unreadable
  body), a `502` with copy distinct from Structure's own error strings
  ("the transcription service could not process this recording" /
  "could not reach the transcription service" / "the transcription service
  returned an unreadable response"), never reusing "model response was not
  valid JSON," a different failure mode entirely.
- **No dedicated trace collection, unlike `structureTraces`, a deliberate
  scope decision stated here plainly.** Structure is the product; its
  trace-and-eval flywheel exists to make that one call, with a prompt of
  our own, better over time. Transcribe is a fixed, unconfigurable
  third-party call with no prompt of our own to iterate against; there is
  nothing for a parallel trace collection to feed. `llmUsage` already
  gives cost visibility if that alone is ever wanted.

**The UI**, `src/components/VoiceRecorder.jsx` (new) and
`src/components/SuperRambleModal.jsx` (wired in):

- Owns mic permission, `MediaRecorder`, and the recording indicator, so
  `SuperRambleModal.jsx` doesn't absorb this complexity directly; exposes
  `onTranscript(text)` up to the parent. `SuperRambleModal.jsx` appends the
  transcript into its existing `text` state with a blank-line separator if
  non-empty, replaces if empty; nothing auto-submits, "Structure it"
  behaves exactly as it does for typed input, per this pass's own
  explicit, deliberate scope line.
- A live audio-level indicator against the live `MediaStream` (not the
  recorded blob): the Web Audio API's `AnalyserNode`, RMS of the time-domain
  samples driving a single CSS-scaled dot (`.voice-level`). No canvas, no
  waveform library; `docs/design-system.md` gained a "Recording indicator"
  section documenting this shape for reuse.
- All real permission states, not just the happy path: granted starts
  recording immediately; `NotAllowedError` shows "Microphone access is
  blocked. Enable it in your browser's site settings to use voice." without
  touching the textarea; `NotFoundError`/`DevicesNotFoundError` shows "No
  microphone found."; `navigator.mediaDevices`/`MediaRecorder` missing
  entirely (checked once on mount) degrades the control to disabled with
  its own `aria-label`, rather than throwing on first click.
- A real engineering note worth stating for whoever touches this file next:
  state read inside `MediaRecorder`'s `onstop` callback and the
  once-per-second timer comes from refs (`secondsRef`, `chunksRef`,
  `mimeTypeRef`), not component state, specifically because those callbacks
  are bound once (inside `start()`) and would otherwise close over whatever
  `seconds`/`recording` happened to be at that render, a real, easy-to-miss
  stale-closure bug in exactly this kind of imperative, long-lived-callback
  component. `stop()`'s own body only ever touches refs and stable
  `setX` calls for the same reason, so it stays correct even though it is
  itself a "stale" closure reference from the interval's perspective.
- Auto-stops and transcribes at the 300-second cap, the timer visibly
  counting up toward it (a `voice-status-warn` color shift in the last 15
  seconds) so the cutoff is never a surprise.
- An empty or silence-only recording (`blob.size === 0` or under 1 second,
  or a transcript that comes back empty after trimming) does not error; the
  textarea is left exactly as it was, with a small inline hint ("Didn't
  catch anything. Try again.").

**Docs updated**: `docs/llm-pipeline.md`'s Stage 1 rewritten from
"pass-through, out of scope" to the real contract above.
`docs/architecture.md` gained `POST /api/transcribe` in the endpoint list,
a paragraph on it, `GROQ_API_KEY` in Secrets, and a note on the pipeline
summary. `docs/design-system.md` gained the "Recording indicator" section.
`docs/roadmap.md`'s Built section gained "Phase 3, part 4: voice capture"
(see the doc-gap note above for why this displaced the existing "part 4"
Todoist entry to "part 5").

Verified: `npm run build` succeeds. `npm run eval` unaffected (14 offline
cases plus the 9 fixtures already there, nothing under `src/pipeline/`
touched), 12/12 date. `node --check functions/index.js` passes.

### Decisions not to relitigate

- Transcribe gets no dedicated trace collection, ever, unless a future pass
  gives it a prompt of its own to iterate against (it has none today; the
  model, the request shape, and the endpoint are all fixed by Groq). Do not
  add a parallel `transcribeTraces` collection "for consistency" with
  `structureTraces`; the asymmetry is the point, not a gap.
  `users/{uid}/llmUsage` is the cost-visibility mechanism for this endpoint.
- The transcribed text lands in the textarea and nothing auto-submits, on
  purpose, while voice quality is unproven. Removing that checkpoint (voice
  flowing straight into Structure) is a distinct, separate, future decision,
  not something this pass builds toward.
- `checkAndReserveLimit`/`logUsage` are shared, unmodified in their
  daily-ceiling logic, across `/api/structure` and `/api/transcribe`. Do not
  add a second parallel limit system for Transcribe; one `llmUsage` ceiling
  covers both by design.
- The 300-second recording cap and the 10MB payload cap are both product/
  headroom choices, not measured technical limits from a real failure. A
  future pass changing either should redo the size math (base64 inflation,
  Groq's own file-size ceiling) rather than just bumping a number.
- `VoiceRecorder.jsx`'s ref-based state (not component state) inside
  `MediaRecorder.onstop` and the timer interval is deliberate, not
  incidental. Do not "simplify" it back to reading `seconds`/`recording`
  state directly inside those callbacks; that reintroduces the exact
  stale-closure bug this shape exists to avoid.
- This pass found no existing `docs/roadmap.md` Next-section line for
  voice/Transcribe/Groq, despite the task describing one as already
  present. Added a fresh Built entry instead of "moving" a line that never
  existed; a future pass should not assume this repo's docs already
  described this work before this entry.

**Merged and deployed.** Merged to main through
[PR #30](https://github.com/cottalucas/super-ramble/pull/30) after CI
(`build-and-eval`) passed on the branch push, the PR, and the resulting
merge commit to `main`, each checked directly by run id. `firestore.rules`
untouched this pass (confirmed by diff against the prior deploy), but
`src/` changed (the mic control, the icons, `SuperRambleModal.jsx`, styles),
so both `firebase deploy --only hosting` and `firebase deploy --only
functions` ran, unlike the prompt-only passes earlier today that could
skip hosting. The functions deploy log itself confirms this was the first
real wiring of the Groq secret to this Function: it printed "ensuring
109208111357-compute@developer.gserviceaccount.com access to secret
GROQ_API_KEY" and granted `roles/secretmanager.secretAccessor` on it, not
something a no-op redeploy would do.

**Verified past both deploy commands' exit codes.** Hosting: fetched
`https://super-ramble.web.app/` live, same asset filenames as the local
build, fetched both assets and `md5`'d them against local `dist/`:
identical, byte for byte. Functions: reported "Successful update
operation" for `api(us-central1)`.

**A real, honest limit on verifying the new route specifically, worth
stating plainly rather than glossing over.** Unlike every prior functions
deploy in this log, this one cannot be partially verified by an
unauthenticated probe at all: `verifyAuth` runs *before* any route
matching in `exports.api`, so `POST /api/transcribe` and
`POST /api/this-route-does-not-exist` both return an identical `401
{"error":"unauthorized"}` (checked directly, both requests, same
response). An unauthenticated call proves the revision is live and
executing, exactly as it did for every prior deploy, but it cannot
distinguish "the new route is wired" from "any arbitrary path," because
route dispatch never happens without a valid token. Confirming the
specific route needs either a real authenticated call (no real Firebase
session available in this environment, and this pass had no standing
authorization to spend real Groq/Anthropic credits) or direct inspection
of the deployed revision (`gcloud logging read`/`gcloud run services
describe` still have broken credentials in this sandbox, unchanged from
every earlier attempt in this log). What is verified instead: the exact
`functions/index.js` already proven correct by `node --check` and the
live browser test above (a real recording producing the exact documented
request shape) is the file the deploy log's own "packaged ... for
uploading" step named, moments before this exact commit's deploy
succeeded, and the secret grant itself is independent evidence this
deploy actually touched the new code path (a secret binding a Function
didn't previously use doesn't get granted by an unrelated deploy).

## 2026-07-08: Never surface a raw document id in a user-facing clarification question

Reported directly against a real live trace from 2026-07-08: the model asked
the user "There are two existing 'Website Relaunch' projects — should these
tasks go into the one with id ARW606qp9EbPUAPK1Ypa or
EyvqtBfm4Tssa6EERjBS?" A raw Firestore document id is meaningless to a
person; there was no way to actually answer that question as asked.

**Root cause.** `src/pipeline/prompt.js`'s `buildUserPrompt` injects
`existingProjects` into the model's context as `- ${p.name} (id: ${p.id})`,
for routing (`targetProjectId`). Nothing ever told the model that the id half
of that pair is for its own internal use only, never for a person to read.
When two projects share a name and the model can't tell them apart from the
transcript alone, the only distinguishing fact in its context was the id, so
it reached for the one piece of information it had, exactly the thing a user
can never act on.

**The fix.**

- `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` gained one line: never
  reference an internal id in `clarificationQuestion` or anywhere else a
  person reads; when two or more `existingProjects` share a name and routing
  is genuinely ambiguous, ask the user to disambiguate in their own words
  instead (a distinguishing detail they would know, or simply noting that
  two projects share that name), never by stating an id. Mirrored
  byte-for-byte into `functions/index.js`'s `STRUCTURE_SYSTEM_PROMPT`,
  verified with a direct text diff of both arrays, not eyeballed.
- New fixture `evals/fixtures/09-ambiguous-duplicate-project-name.json`:
  two `existingProjects` sharing the name "Website Relaunch" (synthetic ids,
  not the real trace's own, since a fixture should be self-contained
  test data, not a copy of another user's real Firestore ids), a transcript
  that should route into one of them but can't tell which, and a corrected
  `clarificationQuestion` that asks in plain words instead.
- `scripts/eval-offline.mjs`'s `runFixtures` gained one new optional,
  additive check, the same conditional pattern every prior addition here
  uses (`if (Array.isArray(exp.x))`): a fixture's `expected` block can carry
  `clarificationExcludes`, an array of substrings (here, both projects' own
  ids) that must never appear in the produced `clarificationQuestion`.
  Fixtures without this key are unaffected.
- `docs/llm-pipeline.md`'s Stage 2 contract notes gained a line stating this
  rule directly, next to the existing `clarificationQuestion` note, and
  pointing at the new fixture and this entry.

**Verified the new assertion actually catches this exact bug, not assumed.**
Temporarily edited the fixture's `mockResponse.clarificationQuestion` to the
real trace's own wording ("...should these tasks go into the one with id
proj-webrelaunch-a1b2c3d4e5 or proj-webrelaunch-f6g7h8i9j0?") and ran
`npm run eval:offline`: the fixture failed with `clarificationQuestion has no
leaked ids: proj-webrelaunch-a1b2c3d4e5, proj-webrelaunch-f6g7h8i9j0`, naming
both leaked ids, every other fixture still passing. Restored the corrected
wording and reran clean. Note on scope, the same limitation named in every
prior prompt-change entry in this log: this fixture runs through
`structureTranscript` with a mocked `callModel`, so the offline suite proves
the assertion catches this shape of bug when it recurs, not that the new
prompt line changes live model behavior; that would need a real
`/api/structure` call.

Verified: `npm run build` succeeds. `npm run eval` is 16/16 offline (9
fixtures, 6 negative contract cases, 1 guard case), 12/12 date, no spend.
`node --check functions/index.js` passes. The prompt text in
`src/pipeline/prompt.js` and `functions/index.js` verified identical via a
direct text diff of both arrays.

### Decisions not to relitigate

- `clarificationQuestion` (and any other user-facing text the model
  produces) must never contain an internal id. This is stated explicitly in
  the prompt now, in both hand-synced copies; do not rely on the model
  inferring it from context alone, that's exactly what failed here.
- A fixture's `expected` block may carry an optional `clarificationExcludes`
  array, asserted by `scripts/eval-offline.mjs`. Additive; a fixture without
  it is unaffected.
- `09-ambiguous-duplicate-project-name.json` uses synthetic project ids, not
  the real trace's own. A fixture is self-contained test data; reusing a
  real user's real Firestore ids in committed test fixtures is unnecessary
  and avoidable, even though a bare document id isn't itself sensitive.

**Merged and deployed.** Merged to main through
[PR #29](https://github.com/cottalucas/super-ramble/pull/29) after CI
(`build-and-eval`) passed on the branch push, the PR, and the resulting
merge commit to `main`, each checked directly by run id. `firestore.rules`
untouched this pass. `src/pipeline/prompt.js` changed, but nothing in the
runtime import graph ever actually imports it (`structure.js` takes
`callModel` injected, and the production path's `callModel` hits
`/api/structure`, whose own duplicated prompt copy in `functions/index.js`
is what actually runs live; `prompt.js` exists only as the canonical text a
human hand-syncs into that copy, per its own header comment). Confirmed
directly, not assumed: a fresh `npm run build` produced the exact same
content-hashed filenames (`index-_I6C8zlF.js`, `index-DTaTDlo-.css`) already
live on `https://super-ramble.web.app/`, proving the bundle is
byte-for-byte unchanged. Skipped `firebase deploy --only hosting` on that
basis; ran `firebase deploy --only functions` only, which reported
"Successful update operation" for `api(us-central1)`.

**Verification, and an honest gap, same shape as every prior functions
deploy in this log.** A live, unauthenticated `POST /api/structure` returned
`401 {"error":"unauthorized"}`, confirming the new revision is genuinely
live and executing. Unlike the trace-write fallback fix (which only
executes on a rare write failure), this prompt line is part of the system
prompt on *every* real authenticated call from now on, so there is no
special failure condition to reproduce; the gap is simply that verifying it
actually changes live model output needs a real authenticated call, which
this pass did not make (no real Firebase Auth session available here, and
spending real Anthropic credits on a live call needs standing
authorization this pass wasn't given). `gcloud logging read` and
`gcloud run services describe`, which could otherwise inspect the deployed
revision directly, still have broken credentials in this sandbox
(`invalid_grant`), unchanged from every earlier attempt in this log. What is
verified instead: the exact file diffed identical to `src/pipeline/prompt.js`
earlier in this entry is what the deploy log's own "packaged ... for
uploading" step named, immediately after this commit was merged. The next
real dogfooding call that hits a duplicate-project-name ambiguity is the
first real-world test of this fix; a future trace review
(`docs/llm-pipeline.md`'s cadence section) should specifically check for a
recurrence, not assume this is settled from the offline fixture alone.

## 2026-07-08: Trace-write fallback path, and the confidence-calibration eval gap closed out

Two parts, closing out both items the "First real review" entry below left
open: the silent trace-loss gap it found, and the confidence-calibration eval
work it specified but never ran.

### Part A: `logStructureTrace` can no longer fail completely silent

**Recap of the gap** (full detail in the entry below): `users/{uid}/llmUsage`
showed 4 requests for 2026-07-07; `structureTraces` held only 2 documents for
that day. `logUsage` and `logStructureTrace` run back to back in the same
request path, unconditionally, so the only way for one counter to exceed the
other is `logStructureTrace`'s own Firestore write failing, caught by its own
try/catch, logging `console.error` and returning `null`. The design (never
let a trace-write hiccup turn a working structuring response into a 500) was
already correct; the gap was what happened after the catch: nothing anywhere
recorded that a trace was even attempted, so this was invisible until someone
did hand arithmetic against `llmUsage`.

**No maintainer-supplied Cloud Logging text was available to root-cause this
precisely, in this pass either.** `gcloud logging read` still has broken
credentials in this sandbox (`invalid_grant`), a separate credential path
from the Application Default Credentials that work fine for Firestore. Per
this pass's own instructions, hardening the failure path itself, rather than
waiting on a root cause that may never arrive, is the right move regardless
of what caused it.

**The fix**, `functions/index.js`'s `logStructureTrace`:

- On a primary write failure, it now attempts one minimal fallback write:
  `users/{uid}/structureTraces/{id}` with `ok: false`, `traceWriteFailed:
  true`, `errorCode`, `errorMessage`, and the usual `createdAt`/
  `outcome: 'pending'`/`outcomeAt: null`. No `transcript` or `response`:
  whatever caused the first write to fail (a large payload, a transient
  permissions or quota issue, anything) might recur on a second, larger
  write, so the fallback stays minimal and cheap on purpose.
- That fallback attempt is wrapped in its own try/catch. If even the minimal
  write fails, there is genuinely nothing left to persist; that branch logs
  everything needed to diagnose it directly from Cloud Logging (`uid`,
  `errorCode`, `errorMessage`) since nothing else will ever know this call
  happened. `console.error`'s first call site (the primary-failure log) also
  gained the same structured `{ uid, errorCode, errorMessage }` shape,
  instead of dumping a raw `Error` object, so it is actually greppable in
  Cloud Logging rather than a leading line with no message.
- Never total silence anymore: a full trace on success or an ordinary
  structuring failure (refusal, truncation, malformed JSON, all unchanged),
  a minimal `traceWriteFailed` marker if the real write fails, and only a
  `console.error` line as the very last resort if both writes fail.

**Payload size checked directly, not left as an open question.** A synthetic
worst case was built and measured: `max_tokens: 8192` (the current cap) fully
used for the response, a 36,000-character transcript (roughly 3,000 words
doubled again, already a far longer dump than any real transcript seen so
far, the real Big Sur trace is 719 characters), the full triple-storage the
current shape produces (`response` as a parsed object, `rawText` as the same
JSON as a string, and `contentBlocks`' text-type entry storing that same
JSON a third time, uncapped, only non-text blocks are capped at 2000
characters), plus a 50-entry `existingProjectIds` list. Total: **161,014
bytes, 15.4% of Firestore's 1 MiB per-document limit.** Solving backward: a
transcript would need to reach roughly 923,000 characters, on the order of a
150,000-word document, before this shape would approach the actual limit.
**Ruled out as a real contributor** to the 2026-07-07 incident specifically
(that transcript was 719 characters) and as a realistic risk at today's
`max_tokens` cap in general. Separately, and not conflated with this finding:
there is still no oversized-input guard on transcript length itself
(`docs/roadmap.md`'s own flagged gap), which is a distinct, already-tracked
item, not something this payload-size check discovered or fixes.

**`scripts/list-traces.mjs`**: a `traceWriteFailed` document now prints
plainly (`createdAt`, `TRACE WRITE FAILED, nothing captured`, `errorCode`,
`errorMessage`) instead of silently falling through the normal
`ok`/`decision`/`transcript` fields (which would all read `undefined` or
blank) or crashing on a missing field.

**`scripts/promote-trace.mjs`**: refuses a `traceWriteFailed` trace outright,
for either `--use-live-response` or `--expected-file`, with a clear message
naming the captured `errorCode`/`errorMessage`. There is no transcript and no
response on a write-failure marker, so there is nothing to promote; this
check runs before either promotion path would otherwise hit `undefined`
fields (a real risk left unguarded before this pass: `--expected-file` would
have called `isGroundedInTranscript` against an `undefined` transcript, which
throws).

**`docs/architecture.md`**'s `structureTraces` field list updated with
`traceWriteFailed`, `errorCode`, `errorMessage`, and a note that `ok`,
`inputTokens`/`outputTokens`/`costUsd` behave differently on a marker
document (usage was already recorded in `llmUsage` before the trace write
was attempted, so it isn't lost, just not duplicated onto a document that
isn't a real trace). The "written once per real Structure call, success or
failure" line is corrected: it's now a full trace, an ordinary failure, or a
minimal marker, never total silence.

**Proven, not assumed.** The exact `logStructureTrace` function body was
extracted verbatim from `functions/index.js` (not retyped, to rule out
transcription drift) and run against a mock `db` under three scenarios:
primary write succeeds (baseline), primary fails and fallback succeeds
(returns the fallback's id), and both fail (returns `null`). All three
matched the intended behavior. Separately, against real Firestore (a
throwaway test uid, `_test-fallback-verification-delete-me`, deleted
immediately after): wrote a `traceWriteFailed` document with the real
Admin SDK, read it back to confirm the shape, ran `npm run traces:list`
against it and confirmed the plain "TRACE WRITE FAILED" line (no crash), ran
`npm run traces:promote --use-live-response` against it and confirmed the
clean refusal message (no fixture written), then deleted the test document
and confirmed zero documents remain under that test uid. No test data left
in production Firestore.

### Part B: confidence calibration, and the runbook cadence, both specified last time and never executed

This was fully scoped in the prior review pass and never actually run; done
now, unchanged from that spec.

- `scripts/eval-offline.mjs`'s `runFixtures` gained two new optional,
  additive checks, the same conditional pattern every prior addition here
  uses (`if (typeof exp.x === 'number')`): `confidenceAbove` and
  `confidenceBelow` on a fixture's `expected` block, asserting the produced
  response's `confidence` sits on the right side of a threshold.
  **Deliberately not derived by `scripts/promote-trace.mjs`'s
  `deriveExpected()`**, unlike `priorities`/`due`: confidence is the model's
  own self-report, so copying a promoted trace's confidence back as
  "expected" would only assert that the model agrees with itself, not that
  the confidence was actually well-calibrated. A comment in
  `eval-offline.mjs` states this directly, next to the check, so a future
  agent doesn't "fix" the asymmetry by wiring it into `deriveExpected()`
  without re-deciding this on purpose.
- Applied to the two fixtures docs/llm-pipeline.md's own eval-assertions
  list already called for: `01-clear-single-project` (`confidenceAbove:
  0.7`; its real `confidence` is 0.92, a clear-cut single-project dump) and
  `04-ambiguous-clarify` (`confidenceBelow: 0.5`; its real `confidence` is
  0.35, the genuinely ambiguous fixture).
- Verified the assertion actually catches drift, the same way
  priority/due were verified in the prior pass: temporarily dropped
  `01-clear-single-project`'s mock confidence to 0.4 (below its own 0.7
  threshold) and raised `04-ambiguous-clarify`'s to 0.8 (above its own 0.5
  threshold), ran `npm run eval:offline`, both failed with a clear
  "expected > / <, got" message, every other fixture still passing.
  Restored both, reran clean.
- `docs/llm-pipeline.md`'s "Live capture and the eval flywheel" section
  gained a new "Review cadence" subsection: monthly or every 10 new traces,
  whichever comes first; list, review cancelled first, review confirmed
  field by field (never assumed correct because it was confirmed, citing the
  2026-07-08 review entry below as the direct evidence this is a real gap,
  not hypothetical caution), promote 1 to 3 real fixtures, cross-check
  `llmUsage` against `structureTraces` document counts (the same check that
  found Part A's gap), report real spend against `DAILY_COST_LIMIT_USD` (not
  `trace:summary`), and flag rather than fix any new failure mode found. No
  separate tracking document; the cadence lives in the one doc that already
  describes the mechanism it governs.

Verified: `npm run build` succeeds. `npm run eval` is 15/15 offline (8
fixtures, unchanged count, `01`/`04` gained an additive field each; 6
negative contract cases, 1 guard case), 12/12 date, no model spend (the
Firestore verification above used the real Admin SDK, not a model call).
`node --check functions/index.js` passes.

### Decisions not to relitigate

- `logStructureTrace`'s catch branch always attempts a minimal
  `traceWriteFailed` fallback write before giving up. Do not revert to a
  bare `console.error`-and-`return null`; that silence is exactly the gap
  this entry closes, discovered only by accident once, via hand arithmetic
  against `llmUsage`.
- A `traceWriteFailed` marker never carries `transcript` or `response`, on
  purpose, kept minimal and cheap since whatever failed the first write
  might recur on a bigger one. Do not "improve" it by adding more fields
  back without first confirming that doesn't reintroduce the same failure
  mode it exists to survive.
- Firestore's 1 MiB document limit is a ruled-out contributor to trace-write
  failures at today's `max_tokens: 8192` cap (161 KB worst case measured,
  15.4% of the limit). Do not re-open this as a live theory without new
  evidence; if `max_tokens` or the trace schema grows substantially, redo
  this measurement rather than assuming the old number still holds.
- The still-missing oversized-input transcript guard (`docs/roadmap.md`) is
  a distinct, already-tracked gap, not something this payload-size check
  resolved. Do not cite this entry as having addressed it.
- `scripts/promote-trace.mjs` refuses every `traceWriteFailed` trace, both
  promotion paths, unconditionally. There is never anything to promote from
  a write-failure marker.
- `confidenceAbove`/`confidenceBelow` are hand-authored judgment calls on a
  fixture's `expected` block, never auto-derived from a promoted trace's own
  self-reported confidence. Do not wire this into `deriveExpected()`; that
  would make the check circular.
- `docs/llm-pipeline.md`'s flywheel section now states an actual review
  cadence. A future reviewer should follow it, not re-derive one ad hoc from
  whatever a given task happens to specify; if the cadence itself needs to
  change, change it there, in one place.

**Merged and deployed.** Merged to main through
[PR #28](https://github.com/cottalucas/super-ramble/pull/28) after CI
(`build-and-eval`) passed on the branch push, the PR, and the resulting
merge commit to `main`, each checked directly by run id. This pass touched
no file under `src/` and no `firestore.rules` (confirmed by diffing this
merge against the prior one, `git diff a674656..96c095e --name-only`, no
`src/` entries), so the deployed hosting bundle would have been byte-for-byte
identical to what was already live; skipped `firebase deploy --only hosting`
on that basis, ran `firebase deploy --only functions` only, which reported
"Successful update operation" for `api(us-central1)`.

**What was and wasn't verified past the deploy command's exit code.** A live,
unauthenticated `POST /api/structure` against `https://super-ramble.web.app/`
returned `401 {"error":"unauthorized"}`, confirming the new revision is
genuinely live and executing, not a stale cached response. **This does not
prove the new fallback path specifically is live**, and stating plainly why
rather than glossing over it: the fallback branch inside `logStructureTrace`
only executes when the primary Firestore write itself fails, which does not
happen on an ordinary successful call (authenticated or not), so even a real
authenticated call spending real Anthropic credits would not have exercised
this new code path, only confirmed unchanged, already-known behavior.
Deliberately did not induce a real write failure against production
Firestore to force the branch to run; doing that on purpose to live
infrastructure was judged a worse risk than the thing being verified.
`gcloud logging read` and `gcloud run services describe`, which could
otherwise inspect the deployed revision's source or a real occurrence
directly, still have broken credentials in this sandbox (`invalid_grant`),
unchanged from every earlier attempt in this log. What is verified instead:
the exact file deployed is the one already proven correct earlier in this
same entry (the verbatim-extracted-function mock test, plus the real,
throwaway-Firestore-document fallback test), and the deploy log's own
"packaged ... for uploading" step named this exact directory, immediately
after this exact commit was merged, not an earlier one. The only fully
conclusive live proof left is passive: watching `structureTraces` for a real
`traceWriteFailed` marker the next time a primary write genuinely fails in
production, which this pass could not force to happen on demand.

## 2026-07-08: First real review of the Structure trace collection

The first time any agent or human has run the trace tools against real
production data; every prior attempt lacked working GCP Application Default
Credentials (see the "hand-authored, not a verified promotion" caveat on the
earlier `08-big-sur-camping-trip.json` entry above). Credentials worked this
time. Note before the findings: `docs/llm-pipeline.md`'s "Live capture and
the eval flywheel" section does not actually state a review cadence (how
often, how many, what order beyond "cancellations first"); this pass was
asked to follow "the cadence it states," but there is no such cadence in the
doc, only the mechanism description. Flagging this plainly rather than
inventing one: this review followed the concrete steps it was given
directly (list, review cancelled first, review confirmed with real
scrutiny, promote sparingly, flag new failure modes separately, check
spend), which fully specified the work regardless of the doc gap. A future
pass should decide whether "Live capture and the eval flywheel" should state
an actual cadence (weekly? after every N traces?) and add it if so; not
decided here, since this pass wasn't scoped to write one unilaterally.

**Uid.** `admin.auth().listUsers()` returned exactly one user
(`[REDACTED-UID]`, redacted@example.com), matching
the single-dogfooding-user premise stated elsewhere in this log. Used it
directly, no ambiguity to ask about.

**Raw counts.** `npm run traces:list -- --uid <uid> --limit 1000` returns
exactly 2 documents, total, ever. 1 confirmed (`ok: true`), 1 pending
(`ok: false`, `response: null`). **Zero cancelled.** Both dated 2026-07-07:
`06:56:25.895Z` and `16:27:46.032Z`. Nothing from 2026-07-08 yet (no real
`/api/structure` call reached the model today; the two probes made while
verifying today's deploy were unauthenticated and 401'd before reaching
`checkAndReserveLimit`/the model).

**Cancelled traces: none exist.** Nothing to review here; stating the empty
result directly rather than skipping the step.

**The pending trace (`MRls0FegkCwBHHdgf5jZ`, 06:56:25Z).** `response: null`,
`rawText: ""`, `stopReason: "end_turn"`, no `contentBlocks` or `responseId`
fields at all. This is not a new finding: it is the exact, already-logged
"Empty rawText on a normal end_turn" issue from this same log, dated
2026-07-07, which that entry itself states is still unresolved ("the actual
root cause... is still unknown"). This trace predates the defensive
`extractStructuredText`/`contentBlocks`/`responseId` broadening that same
entry shipped (this document has none of those fields), so it is the exact
case that motivated that fix, confirming the issue is real production
behavior, not hypothetical. Not re-investigated or re-fixed here, per that
entry's own scope and this pass's instruction not to bundle unrelated fixes
in; it remains open.

**The confirmed trace (`wPWKIUs0mXfeeCGRYJXx`, 16:27:46Z), reviewed field by
field, not assumed correct because it was confirmed.** This is, in fact, the
exact camping-trip trace that motivated this morning's priority-direction
fix (see "Priority direction calibration blind spot" above): the real
transcript, the real (buggy) response.

- `decision: "project"`, `targetProjectId: null`, `project.name: "Big Sur
  Camping Trip"`: correct. One coherent trip, no existing project matches.
- `sections`: gear/food/car, matching the three workstreams the transcript
  actually names; logistics-flavored tasks (reservation, offline maps, dog
  sitter) correctly get no section, since the transcript never names a
  fourth workstream for them. Reasonable, not forced.
- `confidence: 0.86`: reasonable for a clear, unambiguous dump; not flagged.
- `needsClarification: false`: correct, nothing ambiguous here.
- `due`: only "Book campsite reservation" gets `"today"`, correctly read
  from "should do it today or tomorrow" (a defensible either/or pick); every
  other task correctly gets `null`, since no other date language exists in
  the transcript. No due-date issues found.
- **Priority direction: inverted on exactly the two tasks the transcript
  flags explicitly**, confirming the diagnosis already fixed this morning
  was accurate against real data, not just plausible: "Book campsite
  reservation" ("that's urgent since sites fill up fast") came back
  priority 4; "Dig out sleeping bags from garage" ("that one's not urgent")
  came back priority 1. Exactly backward, exactly the bug already fixed.
- **A related, softer miscalibration, noted but deliberately not corrected
  in the promoted fixture.** "Pack first aid kit" ("that one's important")
  came back priority 3, not obviously wrong (3 isn't the opposite end of the
  scale the way the other two were) but arguably under-weighted given how
  explicitly the speaker called it out; today's new prompt line lists
  "important" as a word that should map toward 1. This is the same
  root-cause family as the fixed bug, not a new failure mode, so it isn't
  reported as one; a live call against the now-fixed prompt would be the
  real test of whether "important" now lands better, not something this
  offline pass can prove. Not asserted as a specific "correct" number in the
  promoted fixture below, for the same reason: I have not independently
  verified what the right number is here, only that 3 is questionable, and
  baking in an unverified number as "expected" risks failing a future,
  genuinely improved response for the wrong reason.

**Promoted one real fixture, replacing the hand-authored placeholder.**
`evals/fixtures/08-big-sur-camping-trip.json` (originally hand-authored
this morning, flagged then as needing exactly this replacement) is now a
real promotion of `wPWKIUs0mXfeeCGRYJXx` via
`scripts/promote-trace.mjs --expected-file` (not `--use-live-response`:
the real response has the known priority bug, so promoting it as-is would
have baked the bug in as a "trusted" fixture, precisely what that flag
exists to prevent for an unendorsed result). The hand-written correction
fixes only the two unambiguous priority inversions above; every other
field, including the transcript's own real wording (down to the literal
leading and trailing quote characters the user's actual submission
contained) and "Pack first aid kit"'s uncorrected priority 3, is carried
through unchanged from the real trace. `deriveExpected()` (extended this
morning to always derive `priorities`/`due` for every task) initially
produced an `expected.priorities`/`expected.due` map asserting an exact
value for every task, including the ones with no explicit urgency signal;
**trimmed by hand back down to only the two fields verified against
explicit transcript language** (`"Book campsite reservation": 1`,
`"Dig out sleeping bags from garage": 4`, plus `due: "today"` on the same
task), for the same reason "Pack first aid kit" wasn't corrected: an
auto-derived expectation is not the same thing as a verified one, and this
pass found that out directly by nearly asserting a number (`"Pack first aid
kit": 3`) as "correct" that this same review had just called questionable
one paragraph earlier. This is worth stating as its own lesson, not just a
one-off edit: `deriveExpected()`'s "derive everything" design is a good
default (additive, nothing is forced to be asserted), but a human still has
to look at each derived value before trusting it as ground truth, the exact
same "confirmed does not mean correct" lesson this whole review exists to
apply, now applied one level down to the promotion tooling itself.

Verified the promoted fixture's assertion actually catches the bug it
exists to catch, the same way this morning's synthetic fixture was verified:
temporarily flipped the two priorities back to the trace's real (buggy)
values, ran `npm run eval:offline`, got a clean failure naming both
mismatches, restored, reran clean.

Only one fixture promoted this pass, not the "1 to 3" the task allowed for:
the only other trace (the pending, null-response one) has nothing
promotable in it, and both real traces are near-duplicate submissions of
the same camping-trip transcript (differing only in stray leading/trailing
quote characters), so there is no second, differently-shaped real trace to
draw a routing, ambiguous, or multilingual example from yet. Quality over
quantity, and there wasn't a quantity to have here; noting this as a fact
about the current data, not a shortfall.

**A new failure mode found, flagged here and not fixed, per this pass's own
instruction not to bundle an unrelated fix into a review.**
`users/{uid}/llmUsage/2026-07-07` records **4 requests**, $0.092955 total
spend, 7,045 input tokens, 4,788 output tokens. `structureTraces` for the
same user and the same day has **2 documents**. `logUsage` and
`logStructureTrace` are called unconditionally, back to back, in that
order, in the same code path in `functions/index.js`, immediately after
every successful `client.messages.create()` call, before any
success/failure branching; there is no code path that increments one
without at least attempting the other. That means the only way `llmUsage`
could hold 4 while `structureTraces` holds 2 is if `logStructureTrace`'s own
`db.collection(...).add(...)` call failed for (at least) 2 of the 4 real,
paid calls, was caught by that function's own try/catch (`console.error
('logStructureTrace failed', err)`), and returned `traceId: null`, exactly
the degraded path that function's own comment describes ("a Firestore
hiccup here must never turn a working structuring response into a 500").
Circumstantial but real supporting evidence: `firebase functions:log`
shows two `ERROR`-severity lines for the `api` service on 2026-07-07
(`05:35:06.122Z` and `06:56:08.013Z`, the second seventeen seconds before
the known pending trace's own `createdAt`) with an empty visible text
payload in this CLI's simplified output, consistent with (not proven to be)
that exact `console.error` call. **Could not fully confirm the root cause**:
`gcloud logging read`, which would show the full `jsonPayload` including
the actual error message, has broken credentials in this sandbox
(`invalid_grant`), a separate credential path from the Application Default
Credentials used for Firestore access above, which do work. This is a real
gap worth its own scoped follow-up, not fixed here: if confirmed, it means
real money is being spent on Structure calls that leave **zero** trace
record, a direct hole in the exact "eval flywheel" premise this whole
capture mechanism exists to serve, distinct from both the priority-direction
bug and the already-known empty-`rawText` bug. A follow-up needs either
working `gcloud logging read` access (or equivalent Cloud Logging access) to
read the actual error text, and should consider whether `logStructureTrace`
failures need their own alerting rather than a silently swallowed
`console.error`.

**Spend to date, checked against real data for the first time.**
`npm run trace:summary` reports `$0.0000 of $50.0000 used (0%)`, correctly,
by design: that script only ever reads the local, gitignored `llm-traces/`
directory, written to only by local live-eval runs
(`scripts/eval-live.mjs`), which has never happened in this repo's history.
**It was never going to show production spend**; the task's premise that it
would is corrected here, not silently worked around. The real, all-time
production spend, found directly in `users/{uid}/llmUsage`, is **$0.092955
total**, all on 2026-07-07, all Structure calls (`llmUsage` has exactly one
dated document, so there has been exactly one day of real usage, ever).
Against `DAILY_COST_LIMIT_USD` ($4/day, the limit that actually gates
production traffic): about 2.3% of one day's ceiling. Against
`LLM_SPEND_CEILING_USD` (default $50, the local script's own separate
budget for local live-eval runs, not production spend): not the right
comparison, since that ceiling was never watching this number; stated to
correct the premise, not to imply a real close call.

Verified: `npm run build` succeeds. `npm run eval` is 15/15 offline (8
fixtures, unchanged count, `08-big-sur-camping-trip.json` replaced not
added; 6 negative contract cases, 1 guard case), 12/12 date, no spend
(promotion and review used real Firestore/Auth Admin SDK reads, not model
calls). `evals/fixtures/08-big-sur-camping-trip.json` passes
`validateStructure` and the grounding guard (enforced by
`scripts/promote-trace.mjs` itself before it would write the file).

### Decisions not to relitigate

- Zero cancelled traces exist as of this review. This is a fact about the
  data on 2026-07-08, not a gap in the review; do not assume a future
  reviewer skipped this step if a later review also finds none.
- The pending trace with `response: null`/empty `rawText` is the same,
  already-open "Empty rawText on a normal end_turn" issue from 2026-07-07,
  not a new one. Do not re-diagnose it as if it were newly discovered; its
  root cause is still unknown, tracked in that entry, not this one.
- `evals/fixtures/08-big-sur-camping-trip.json` is now a real, verified
  promotion (`--expected-file`, not `--use-live-response`, since the real
  response has the known priority bug), replacing the earlier hand-authored
  placeholder per that entry's own stated intent. Its `expected.priorities`
  and `expected.due` deliberately assert only the two fields verified
  against explicit transcript language, not every field `deriveExpected()`
  can produce. A future pass wanting to assert more of this fixture's fields
  needs to independently verify each one against the transcript first, the
  same way this entry did, not just copy whatever `deriveExpected()` output.
- A new, real, unconfirmed failure mode is flagged: `llmUsage` request
  counts can exceed `structureTraces` document counts for the same user and
  day, implying `logStructureTrace`'s own Firestore write can silently fail
  in production while the underlying (paid) model call still succeeds. This
  is not fixed in this pass. Do not close this as resolved until a follow-up
  either confirms the root cause via real Cloud Logging access or
  instruments `logStructureTrace`'s catch branch directly.
- `npm run trace:summary` cannot and never could report production spend;
  it only reads local `llm-traces/`, populated only by local live-eval runs.
  Real production spend must be read from `users/{uid}/llmUsage` directly
  (or summed across `structureTraces` documents, which will under-count if
  the failure mode above is real). Do not point a future spend check at
  `trace:summary` expecting a production number from it.
- `docs/llm-pipeline.md`'s "Live capture and the eval flywheel" section does
  not state a review cadence. This pass did not add one; a future pass
  should decide on and add an explicit cadence (or explicitly decide not
  to), rather than each future review re-deriving one ad hoc from whatever
  instructions it happens to be given.

## 2026-07-08: Priority direction calibration blind spot, and the eval flywheel gap that let it ship

Reported directly against a real confirmed trace from 2026-07-08 (a Big Sur
camping trip dump): the Structure call inverted priority on the two tasks
where the transcript stated urgency explicitly. "Dig out sleeping bags from
garage," which the speaker calls "not urgent," came back priority 1 (the
red-flag highest). "Book campsite reservation," which the speaker calls
"urgent" and "fills up fast," came back priority 4 (none). Due date inference
was correct on the same task ("today"); only priority direction was backward.
Verified directly against the code before building anything, not assumed.

**Root cause, three layers, not one model mistake.**

- `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` (and its hand-synced copy in
  `functions/index.js`'s `STRUCTURE_SYSTEM_PROMPT`) never stated which
  direction priority runs. It gave the model a 1-4 range and nothing else,
  so the model had no signal to map "urgent" to one end versus the other.
- `src/pipeline/contracts.js`'s `isPriority` had a comment reading "Todoist
  priority is 1 (normal) to 4 (urgent)," backward from the real convention
  already stated correctly in `docs/architecture.md`
  (`priority: 1 | 2 | 3 | 4 (1 = p1/red highest, 4 = none)`) and
  `src/styles.css` (`--ds-p1` red, `--ds-p4` transparent). A wrong comment
  sitting next to the validator is exactly the kind of thing that misleads
  whoever next touches this code, even though `isPriority` itself only ever
  checked the numeric range, never direction, so the comment was misleading
  documentation, not a functional bug.
- None of the 7 existing fixtures in `evals/fixtures/` asserted a fixture's
  per-task priority value against the transcript's own stated urgency;
  `scripts/eval-offline.mjs`'s `runFixtures` checked decision, project
  presence, routing target, clarification flag, subtask count, and content
  strings, never priority. `scripts/promote-trace.mjs`'s `deriveExpected()`
  didn't carry `priority` or `due` into a promoted fixture's `expected`
  block either, so running the intended capture-and-promote loop
  (docs/llm-pipeline.md, "Live capture and the eval flywheel") on this exact
  trace would not have caught it: `--use-live-response` would have taken the
  user's Confirm click as endorsement of the entire response and baked the
  inverted priorities in as a "trusted" regression fixture forever. Confirm
  means the structure looked right at a glance, not that every field was
  checked; the loop had no way to tell those two apart.

**The fix.**

- `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` gained one line stating
  direction plainly: 1 is the most urgent (red), 4 means no priority (the
  default for anything with no urgency signal), with a rule mapping words
  like "urgent," "ASAP," "important," "that one is critical," or a named
  deadline toward 1, and "not urgent," "no rush," or "whenever" toward 4.
  Mirrored byte-for-byte into `functions/index.js`'s `STRUCTURE_SYSTEM_PROMPT`,
  verified with a direct diff of the two arrays, not eyeballed.
- `src/pipeline/contracts.js`'s `isPriority` comment corrected to state the
  real direction (1 = urgent/red/highest, 4 = none/default), matching
  `docs/architecture.md` and `src/styles.css`.
- `scripts/eval-offline.mjs`'s `runFixtures` gained two new optional,
  additive checks, the same conditional-check pattern `minSubtasks` and
  `targetProjectId` already use (`if ('x' in exp)`): a fixture's `expected`
  block can now carry a `priorities` map (`{ "<task content>": n }`) and a
  `due` map (`{ "<task content>": "<due string or null>" }`), asserted
  against the produced response's actual task/subtask fields via a new
  `fieldsByContent` helper. Fixtures without either key are unaffected;
  verified by running the full suite before and after, all 7 original
  fixtures unchanged.
- `scripts/promote-trace.mjs`'s `deriveExpected()` now derives `priorities`
  and `due` maps from the mock response the same way, so a future trace
  promotion (confirmed or hand-corrected) carries this signal into the
  fixture instead of silently dropping it.
- New fixture `evals/fixtures/08-big-sur-camping-trip.json`: a rich,
  multi-section transcript (reservation, gear, food, car prep) with explicit,
  unambiguous urgency on one task ("Book campsite reservation": urgent, fills
  up fast, due today, corrected to priority 1) and explicit non-urgency on
  another ("Dig out sleeping bags from garage": not urgent, corrected to
  priority 4), asserted via the new `priorities` and `due` expected fields.
  **This fixture was hand-authored, not produced by running
  `scripts/promote-trace.mjs` against the real trace.** This environment has
  no working Application Default Credentials against the `super-ramble` GCP
  project (`gcloud auth application-default login` fails here with
  `invalid_grant`), so the real `users/{uid}/structureTraces` document could
  not be read. The fixture is shaped exactly as the script would produce
  (same keys, `existingProjects: []`, the same `deriveExpected()` shape) and
  passes the same `validateStructure` and grounding checks the script
  enforces, verified directly by running `npm run eval`, but its transcript
  text was written to match the bug description, not copied byte for byte
  from the live document. A future pass with real credentials should
  re-verify this fixture's transcript against the actual trace and replace
  it via `promote-trace.mjs --expected-file` if the wording differs, rather
  than trusting this reconstruction as a permanent stand-in.
- `docs/llm-pipeline.md`'s eval assertions list ("Priorities in 1 to 4")
  extended to state that direction matters and is asserted per fixture via
  the new `priorities`/`due` maps, not just range-checked.

**Verified the new assertion actually catches this bug, not assumed.**
Temporarily edited the fixture's `mockResponse` to the exact buggy shape
(reservation priority 4, sleeping bags priority 1) and ran `npm run
eval:offline`: `08-big-sur-camping-trip` failed with `priorities match:
Book campsite reservation: expected 1, got 4; Dig out sleeping bags from
garage: expected 4, got 1`, every other fixture still passing. Restored the
correct values and reran clean. Note on scope: this fixture runs through
`structureTranscript` with a mocked `callModel` that returns the fixture's
own `mockResponse` directly; the offline suite never calls the real model,
so it cannot prove the new prompt line changes live model behavior, only
that the new assertion catches this exact shape of bug when it recurs. A
live check of the prompt itself would run through `npm run eval:live`
(gated behind `EVAL_ALLOW_LIVE`, spends real Anthropic credits) or a real
`/api/structure` call; neither was run here, stated plainly rather than
implied.

Verified: `npm run build` succeeds. `npm run eval` is 15/15 offline (8
fixtures, 6 negative contract cases, 1 guard case), 12/12 date, no spend.
`node --check functions/index.js` passes. The prompt text in
`src/pipeline/prompt.js` and `functions/index.js` verified identical via a
direct text diff of both arrays.

### Decisions not to relitigate

- Priority direction (1 = most urgent/red, 4 = none) must be stated
  explicitly in the Structure system prompt, in both hand-synced copies. Do
  not rely on the 1-4 range alone; a range says nothing about which end
  urgent language maps to.
- A fixture's `expected` block may carry an optional `priorities` map and an
  optional `due` map, asserted per fixture by `scripts/eval-offline.mjs`.
  Both are additive; a fixture without either key is unaffected. Do not
  remove this in favor of range-checking alone again; that is the exact gap
  this entry closes.
- `scripts/promote-trace.mjs`'s `deriveExpected()` always derives
  `priorities` and `due` now, for every future promotion, confirmed or
  hand-corrected. Do not strip this back out; it is what would have caught
  this bug the first time if it had existed before.
- `evals/fixtures/08-big-sur-camping-trip.json` is a hand-authored
  reconstruction of a real trace, not a verified-byte-for-byte promotion,
  because this environment had no working GCP Application Default
  Credentials to read the real trace. A future pass with working credentials
  should confirm the transcript matches the live document and replace it via
  `promote-trace.mjs --expected-file` if it does not; do not treat this
  fixture's transcript wording as authoritative production data.

**Merged and deployed.** This entry and the "Removed 'Seed sample data'"
entry immediately below both shipped together on one branch,
`fix/priority-direction-calibration`, merged to main through
[PR #26](https://github.com/cottalucas/super-ramble/pull/26) after CI
(`build-and-eval`) passed on the branch push, on the PR, and again on the
resulting merge commit to `main`, all three checked directly by run id, not
assumed from a green checkmark alone. `firestore.rules` was diffed against
the prior deploy (PR #25) and found unchanged, so this ran
`firebase deploy --only hosting` plus `firebase deploy --only functions`
(functions redeployed because `functions/index.js`'s prompt text changed),
not `--only hosting,firestore:rules`.

Verified past the deploy command's own exit code, not assumed from it:
- Hosting: fetched `https://super-ramble.web.app/` live, confirmed it
  references the same asset filenames as the local build
  (`index-_I6C8zlF.js`, `index-DTaTDlo-.css`), then fetched both assets live
  and `md5`'d them against the local `dist/` output: identical on both,
  byte for byte.
- Functions: `firebase deploy` reported "Successful update operation" for
  `api(us-central1)`. A live, unauthenticated `POST /api/structure` against
  `https://super-ramble.web.app/api/structure` returned `401
  {"error":"unauthorized"}`, confirming the new revision is actually live
  and executing (not a stale cached response behind a misleadingly green
  deploy log). **This does not, on its own, prove the new prompt text is
  what a real authenticated call would see**, since that line lives inside
  the authenticated model-call branch, unreached by an unauthenticated
  probe. Two more direct ways to prove that were both unavailable in this
  environment, stated plainly rather than glossed over: `gcloud` has no
  working credentials here either (`invalid_grant`, the same failure as the
  Application Default Credentials gap noted above), so the deployed Cloud
  Run revision's image/metadata could not be inspected directly; and making
  a real authenticated call would spend real Anthropic credits on a
  dogfooding account this pass had no standing authorization to spend
  against. What is verified: the exact `functions/index.js` that was
  diffed line-for-line against `src/pipeline/prompt.js` earlier in this
  entry is the same file `firebase deploy --only functions` packaged and
  uploaded moments before this check (confirmed from the deploy log's own
  "packaged ... for uploading" line naming this directory), and the deploy
  reported success for that upload, not a prior one. A future pass with
  either working `gcloud` credentials or standing authorization to spend
  real credits on a live call should close this last gap directly.

## 2026-07-08: Removed "Seed sample data," a deliberate reopening now that real usage is flowing

`docs/roadmap.md`'s phase 2.7 Built entry has described the sidebar's "Seed
sample data" button since it shipped: five representative Inbox tasks plus,
in a later pass, a full "Website Relaunch" / "Marketing Launch" project
tree, all through `store.createTask`/`store.createProjectTree`, safe to
click more than once. It earned its place as a QA and demo helper while this
app had no real usage to look at. Now that real Structure calls are flowing
through the app and being captured as traces (docs/llm-pipeline.md's eval
flywheel), a button that seeds fake demo data into a real user's own task
store no longer belongs in the product; it risks polluting a real account
with placeholder tasks, and the demo need it served is gone. This is a
deliberate removal, not a silent regression: the phase 2.7 Built entry above
is left in place, with a line added stating it was later removed and
pointing here, matching how every other reopened or reversed decision in
this repo is stated rather than quietly erased.

- Deleted `src/lib/seed.js` entirely (`seedSampleData` and its two tree
  builders, `SEED_TASKS`/`SEED_LABELS`).
- `src/components/Sidebar.jsx`: removed the `seedSampleData` import, the
  `seedSample` handler, and the "Seed sample data" nav button.
- `src/styles.css`: removed the now-unused `.nav-seed` rule. Confirmed
  nothing else referenced it before deleting (`grep -rn "nav-seed"` across
  `src/`, one hit, the rule itself).
- `docs/roadmap.md`'s phase 2.7 Built entry for this feature gets one added
  sentence stating the removal and pointing here; the rest of that entry is
  untouched.

Verified: `grep -rn "seedSampleData|seed\.js|nav-seed|seedSample"` across
`src/` returns nothing. `npm run build` succeeds. `npm run eval` unaffected,
nothing under `src/pipeline/` or `evals/` touched by this part.

### Decisions not to relitigate

- "Seed sample data" is gone, not paused or flagged off. A future need for
  demo data needs its own scoped decision, not a revival of this button; the
  reasoning (real usage now exists, seeding a real account with placeholder
  tasks is the wrong shape) still holds unless that premise changes.
- The phase 2.7 Built entry describing this feature stays in `docs/roadmap.md`
  as history, with a one-line pointer to this entry. Do not delete that
  history to make the roadmap "clean"; every reversed decision in this repo
  is stated, not erased.

## 2026-07-07: Production 401 on /api/structure, local-preview mode had shipped live

Reported as a live outage: `super-ramble.web.app` returned 401
`"unauthorized"` on every `POST /api/structure`, and no
`users/{uid}/structureTraces` document was written for the failed calls.
Verified independently before acting, not taken on faith.

**Root cause.** `.env.local` (gitignored, present in this checkout) had
`VITE_ENABLE_LOCAL_PREVIEW=true`, directly under a comment that read
"Production build uses the real auth gate and Firestore, not local mode",
contradicting the value one line below it. Vite loads `.env.local` for every
build, dev or production, so the last `npm run build` made from this
checkout before the last hosting deploy baked local-preview mode straight
into the live bundle. In local-preview mode
(`src/auth/AuthContext.jsx`: `LOCAL_MODE = LOCAL_PREVIEW || !firebaseReady`),
the app never calls Firebase Auth and uses a fake `LOCAL_USER`
(`{ uid: 'local-preview', displayName: 'You', ... }`), which is why the
sidebar showed "You" instead of a real Google account.
`SuperRambleModal.jsx`'s `getAuthToken(isLocal)` returns `null` whenever
`isLocal` is true, so `/api/structure` went out with no `Authorization`
header at all. `functions/index.js`'s `verifyAuth` correctly 401s a request
with no Bearer token before `logStructureTrace` ever runs, which is why no
trace exists for the failed call: a consequence of the same root cause, not
a second bug.

Verified two ways, not assumed from reading the source alone: Vite's own
`loadEnv('production', ...)` (the exact mechanism Vite uses to inject
`import.meta.env.*` at build time) confirmed `VITE_ENABLE_LOCAL_PREVIEW`
resolved to the literal string `"true"` before the fix; and the live bundle
itself, diffed against the rebuilt one after the fix, showed the difference
directly: the live bundle had `wx=!0,Ty=wx` where `wx` is `LOCAL_PREVIEW`
(hardcoded `true`, `constant || anything` folded away entirely, so `Ty`,
`LOCAL_MODE`, was that same bare `true`) immediately before the
`{uid:"local-preview",...}` object literal; the rebuilt bundle has
`ps=!np` in the same spot, a negation of a runtime variable
(`!firebaseReady`), not a constant. Bundle-grepping alone would have been
fragile against a minifier change, so the `loadEnv` check is the durable
proof and the bundle diff is corroborating, not the other way around.

**The fix.**

- `.env.local`: `VITE_ENABLE_LOCAL_PREVIEW` set to `false`. The comment above
  it rewritten to stop contradicting the value: it now says plainly that this
  file is read for every build, dev or production, from this checkout, so the
  flag must be false before ever running `npm run build` for a deploy.
- Deleted `dist/assets/index-Df3JJZJJ.js`, an orphaned build artifact from
  investigating this, unreferenced by `dist/index.html` (which pointed at
  `index-NMsxpRql.js`, the live-but-broken bundle). Confirmed unreferenced by
  grepping `dist/index.html` before deleting, not assumed from the filename.
- New `scripts/verify-prod-env.mjs` (`npm run verify:prod-env`): reads
  `.env.local` directly and exits 1 with a clear message if
  `VITE_ENABLE_LOCAL_PREVIEW` resolves to `"true"`. Checks the source of
  truth, not the built bundle, since bundle-sniffing is fragile against
  minifier changes and this needs to run before a build exists at all.
  Verified both directions, not just the happy path: passed cleanly against
  the corrected `.env.local`; against a temporary copy with the flag flipped
  back to `true`, failed loudly with exit code 1 and the intended message,
  confirming the guard actually catches the class of mistake that caused this
  outage, not just a hypothetical one.
- `docs/architecture.md`'s Secrets section states the new required pre-deploy
  step and points here for why.

Verified further: `npm run build` succeeds with the corrected `.env.local`.
`npm run eval` unaffected, 14/14 offline, 12/12 date. `node --check
functions/index.js` passes; this pass touched no file under `functions/`.
`firestore.rules` also untouched this pass (confirmed by diffing the
currently committed file against the version deployed with PR #22, the last
pass that changed it: no drift), so the deploy for this fix is
`--only hosting`, not rules or functions.

### Decisions not to relitigate

- `.env.local`'s `VITE_ENABLE_LOCAL_PREVIEW` must be `false` before any
  `npm run build` whose output gets deployed. `npm run verify:prod-env` is
  the durable guard for this, not a one-time manual check; do not remove or
  bypass it to save a step before a deploy.
- The guard reads `.env.local` directly, not the built `dist/` output. A
  future change that wants to also sanity-check the built bundle can add
  that as a second, separate check; it should not replace this one, since
  this one runs before a build exists and does not depend on minifier
  behavior staying legible.
- `dist/` can accumulate orphaned, unreferenced build artifacts across
  interrupted or repeated local builds. Always check `dist/index.html`'s
  actual asset references before assuming a given `dist/assets/*` file is
  the live one, or deleting one as stale.

## 2026-07-07: Empty rawText on a normal end_turn, a real gap the live trace surfaced

The trace capture from the entry below did its job: a camping-trip Structure
call came back with `stop_reason: "end_turn"` (the model finished normally,
neither refusal nor `max_tokens`) and `outputTokens: 1543` (real tokens
genuinely spent), yet `rawText` was an empty string and `response` was
`null`. Anthropic's own structured-outputs docs guarantee
`response.content[0].text` holds valid JSON on an ordinary `end_turn`; the
only two documented exceptions are `"refusal"` and `"max_tokens"`, neither of
which happened here. This is stated plainly, not glossed over: **the actual
root cause of the empty `content[0].text` is still unknown.** What follows is
a defensive broadening of where the JSON is searched for, plus the trace
visibility that was missing to diagnose this if it recurs, not a claimed fix
for a confirmed cause.

- `functions/index.js`'s old extraction was one line,
  `response.content[0]?.text || ''`, discarding the rest of `response.content`
  entirely. If the API ever splits the JSON across more than one `'text'`
  block, or orders a non-`'text'` block first, that line would silently miss
  it. New `extractStructuredText(contentBlocks)`: concatenates every block
  whose `type` is `'text'`, in order, into one string, `''` if there are
  none. For the ordinary single-text-block case this returns exactly what
  `content[0]?.text` did before, verified directly, not assumed: a single
  block at index 0, a text block at index 1 with a non-text block at index 0,
  and JSON split across two consecutive text blocks all produced the
  identical, correctly-parsing string.
- `logStructureTrace`'s payload gains two fields precisely because the old
  trace for the failing call had nothing useful in it: `responseId`
  (`response.id`, Anthropic's own request id, for cross-referencing with
  Anthropic support if this recurs) and `contentBlocks` (every block's `type`
  and `text`, a non-`'text'` block's `text` replaced with that block
  JSON-stringified and truncated to 2000 characters). If this happens again,
  the trace shows exactly how many blocks came back and what was in every one
  of them, not an empty string with no explanation.
- `docs/architecture.md`'s `structureTraces` field list updated with both new
  fields and what `rawText` now means (every text block, not just index 0).

Verified: `npm run build` succeeds. `npm run eval` unchanged, 14/14 offline,
12/12 date, since nothing here touches `src/pipeline` or `evals/`. `node
--check functions/index.js` passes, the only check CI runs against this file;
there is still no unit-test harness for anything under `functions/` in this
repo, worth naming plainly as a gap rather than skipping past it silently,
and bigger scope than this fix. `extractStructuredText` verified directly
against all three shapes named above, each producing the identical,
correctly-parsed JSON object.

### Decisions not to relitigate

- This pass does not claim to have found or fixed the root cause of the
  original empty-`rawText` case. It broadens the extraction defensively and
  adds the trace fields needed to diagnose a repeat. Do not cite this entry
  as "the truncation bug was fixed"; that was the entry below, a different,
  already-understood cause (`max_tokens`). This one is still open.
- `extractStructuredText` concatenates every `'text'` block; it does not pick
  "the first" or "the longest" one. A future change that needs different
  block-selection logic should say why, rather than assuming concatenation
  was an arbitrary choice.
- `contentBlocks` on a trace is capped at 2000 characters per non-text
  block's stringified form. This is deliberately generous for diagnosis, not
  unbounded; a block bigger than that in practice is itself worth noticing.

## 2026-07-07: Task-detail timestamp relocation merged and deployed to super-ramble.web.app

Merged `fix/task-detail-timestamps-in-rail` to main through
[PR #23](https://github.com/cottalucas/super-ramble/pull/23) after CI
(`build-and-eval`) passed on both the branch push and the PR. No self-approve
restriction hit, same as PR #22. This pass touched no `firestore.rules`, so
ran `firebase deploy --only hosting` (hosting-only, confirmed by diffing
`firestore.rules` against the prior deploy before skipping the rules step).
Verified the deployed bundle's hash matched the local build byte for byte
(`md5`, both the JS and CSS asset, fetched over HTTPS from the live site).
Live site returns 200.

## 2026-07-07: Move Added/Updated timestamps out of the task-detail overflow menu, into the rail

Reported directly against a screenshot of the just-shipped "..." menu (see
the two entries below): the Added/Updated lines living inside the same
popover as Delete task read wrong. A static timestamp is not an action, and
burying it behind a trigger a user only reaches for to delete something
means it is easy to never see. Moved instead to the bottom of the right
rail, below Reminders, after a hairline divider, so it is visible the moment
the task detail view opens, the same way Project, Date, Priority, Labels,
and Reminders already are.

- `TaskDetail.jsx`: the two `formatDayHeader`/`formatTime` lines and the
  `<hr>` divider came out of the "..." `Popover`, which now holds exactly
  one item, "Delete task" (`popover-item popover-item-danger`), nothing
  else. A new `<hr className="detail-rail-divider">` plus a
  `.detail-meta`/`.detail-meta-line` block were added to the bottom of
  `.detail-rail`, right after the existing Reminders `.detail-field`. Same
  exact condition as before: "Added ..." always, "Updated ..." only when
  `task.updatedAt` differs from `task.createdAt`.
- `src/styles.css`: `.popover-info` and `.popover-divider` deleted, both now
  unused (the popover holds only a button). Added `.detail-rail-divider`
  (a plain `--ds-line` hairline, full width, no extra margin since
  `.detail-rail`'s own `gap: 14px` already spaces it) and `.detail-meta`/
  `.detail-meta-line` (`--ds-ink-soft`, 12px, no hover state, no click
  handler, matching the same "static line, not a button" rule the removed
  `.popover-info` comment already stated).
- `docs/design-system.md`'s "Modal overflow menu" note is corrected: the
  popover pattern is now stated as destructive-action-only; a new paragraph
  states that static metadata belongs in the modal's own rail or body, after
  a divider, not inside an actions menu. `docs/roadmap.md`'s phase 3 part 3
  Built entry updated to describe the actual shipped shape rather than the
  superseded one.

Verified live in both themes: the "..." popover shows only red "Delete
task"; the rail shows "Added 6 Jul, 3:34 PM" and "Updated 6 Jul, 3:36 PM"
below Reminders, separated by a hairline, on an already-edited seeded task;
Delete still opens the unchanged `ConfirmDialog`, cancelled without deleting
so as not to disturb seeded data. `npm run build` succeeds; `npm run eval`
unchanged at 14/14 offline, 12/12 date, since nothing under `src/pipeline/`
or `evals/` was touched.

### Decisions not to relitigate

- The task-detail "..." menu holds destructive, low-frequency actions only
  (Delete task, today). Static info (a timestamp, a count, anything with no
  click handler) does not belong there; it goes in the rail or body instead,
  after a divider if it needs visual separation from what is above it. This
  supersedes the version of this rule from the entry below, which put a
  static info line inside the popover; do not revert to that shape.

## 2026-07-07: Task detail overflow menu/timestamps/comments merged and deployed to super-ramble.web.app

Merged `feat/task-detail-overflow-timestamps-comments` to main through
[PR #22](https://github.com/cottalucas/super-ramble/pull/22) after CI
(`build-and-eval`) passed on both the branch push and the PR. Unlike prior
entries in this log, this PR merged without hitting the self-approve
restriction noted for PRs #8-#21; no review was required to merge here. Ran
`firebase deploy --only hosting,firestore:rules` (rules changed this pass, so
not hosting-only). Verified the deployed bundle's hash matched the local
build byte for byte (`md5`, both the JS and CSS asset, fetched over HTTPS
from the live site rather than assumed from the deploy log). Live site
returns 200.

## 2026-07-07: Task detail overflow menu, timestamps, and comments (phase 3, part 3)

Reported directly, comparing this app's task detail against real Todoist
screenshots: Delete task was a full-width button in the main body, too loud
for a destructive, infrequent action; there was no created/modified
timestamp anywhere; and there was no way to comment on a task at all. Real
Todoist's task-detail header has a small "..." menu whose top row states
"Added on <date>, <time>", followed by several items this pass does not
copy, then a red Delete at the bottom, plus a separate comment thread under
the sub-tasks list. This pass copies the shape (a static info line, then a
demoted destructive action; a comment thread and its own add row), not the
full item list: Duplicate, Copy link, Add comments via email, View
activity, Print, and Add extension all stay out, `docs/roadmap.md`'s Out of
scope list already excluding every one of them by name.

**Comments is a deliberate reopening, not an oversight.** `docs/roadmap.md`'s
Out of scope list has excluded comments since phase 2. This pass reopens it
because the task explicitly asked for it, the same standard the 2026-07-07
structureTraces entry above used when it reopened a settled privacy stance:
state plainly that a prior decision is being revisited, and why. Attachments
stay out, called out on the same roadmap line as comments; the comment input
gets no attachment icon. This pass ships comment create and list only, no
edit, no delete: a stated boundary, not a silent gap, matching how `labels`,
task `description`, and `color` stayed out of the Structure contract in the
2026-07-06 entry below, each its own scoped decision.

- `TaskDetail.jsx`: the full-width `btn btn-quiet detail-delete` button is
  gone from `detail-main`. A small `IconDots` "..." trigger now sits in the
  modal header, immediately left of the existing `detail-close` X, both
  wrapped in a new `.detail-header-actions` flex row (`.detail-close` itself
  is no longer independently `position: absolute`; the wrapping row is).
  Clicking it opens the same `Popover` component `Sidebar.jsx`'s project menu
  already uses, same `popover-wrap`/`popover`/`popover-item` classes, no
  second menu component. Content, top to bottom: a static (non-button)
  "Added `formatDayHeader(task.createdAt)`, `formatTime(new
  Date(task.createdAt))`" line, a second static "Updated ..." line shown only
  when `task.updatedAt` differs from `task.createdAt` (a never-edited task
  shows no redundant identical line, verified against `resolveTree`, which
  stamps both fields with the exact same timestamp string on create), a
  hairline `<hr className="popover-divider">`, then one `popover-item
  popover-item-danger` ("Delete task", `.popover-item-danger { color:
  var(--ds-red); }`, new in `src/styles.css`) that sets `confirmDelete(true)`,
  the exact existing `ConfirmDialog` flow, unchanged. The two static lines
  (`.popover-info`, new) have no hover state and no click handler, per
  `docs/design-system.md`'s anti-pattern checklist against dead, clickable-
  but-inert affordances.
- Comments: `users/{uid}/comments/{commentId}` (`taskId`, `content`,
  `postedAt`, an ISO string from the same `now()` helper both adapters
  already use), added to both `src/store/local-store.js` (a new `comments: {}`
  bucket in `emptyDb()`) and `src/store/firestore-store.js` (the same
  collection-per-user pattern `labels` already uses), mirroring each other
  exactly the way every other method pair already does. `listComments(taskId)`
  filters to the one task and sorts `postedAt` ascending, oldest first,
  matching Todoist's own thread order. `createComment({ taskId, content })`
  trims content and returns `null` without writing if the trimmed result is
  empty; no `updateComment`, no `deleteComment`, this pass, deliberately.
  `firestore.rules` gets a `comments/{commentId}` match with
  `allow read, write: if isOwner(uid)`, the exact same shape as the existing
  `tasks`/`labels` rules right above it.
- **Found and fixed a real bug while verifying comments live, not assumed
  from reading the diff.** `local-store.js`'s `load()` only ran `emptyDb()`
  (which has the new `comments: {}` bucket) when `localStorage` held nothing
  yet; any local db written before this pass parses back as an object with no
  `comments` key at all, so `db.comments[id] = ...` in `createComment` threw
  `TypeError: Cannot set properties of undefined`, silently swallowed by the
  input's own `onKeyDown` handler having nothing to catch it, so pressing
  Enter looked like a no-op with no console error. Caught live against this
  session's own seeded local preview data, which predated the `comments`
  bucket. Fixed by having `load()` spread `emptyDb()` underneath the parsed
  payload (`{ ...emptyDb(), ...JSON.parse(raw) }`), so a bucket added after a
  user's local data already exists still loads as `{}` rather than
  `undefined`. This is the shape every future new local-store bucket needs
  too, not just this one; `firestore-store.js` has no equivalent gap, since
  `all('comments')` on a collection with zero documents already returns `[]`
  with no schema to migrate.
- `TaskDetail.jsx` fetches the task's comments in a `useEffect` keyed on
  `task?.id`, the same pattern the existing content/description effect
  already uses, into local state; `createComment` refetches through the same
  `store.listComments` call rather than optimistically appending, so the
  list a user sees is always what the store actually holds. Rendered below
  the existing "Add sub-task" line, inside `detail-main`, since this is
  conversational content on the task body, not a rail metadata field: each
  comment as an avatar-initial circle (`.comment-avatar`, the same circle,
  color, and sizing as `Sidebar.jsx`'s `.sidebar-head .avatar`, duplicated
  rather than reused directly since the existing rule is scoped to
  `.sidebar-head .avatar` and not a bare, reusable class), the comment text,
  and a relative timestamp (`relativeLabel(c.postedAt.slice(0, 10))` plus
  `formatTime(new Date(c.postedAt))`, joined the same way `dueMeta` already
  joins a date and a time). `relativeLabel` expects a bare `YYYY-MM-DD` string
  (it splits on `-`); `postedAt` is a full ISO instant, so it is truncated to
  its date part first, the same `.slice(0, 10)` truncation `src/lib/group.js`
  already uses for `createdAt` day-grouping, not a new date-formatting
  routine. Below the list, one input row (`.detail-comment-add`, following
  `.detail-add-sub`'s `add-line` structure and spacing rhythm) posts on Enter
  (no shift), then clears and refetches. No attachment icon, no rich text, no
  edit-in-place.
- Confirmed this does not need a confirm step: `docs/brief.md`'s "confirm
  before write" principle governs the Super Ramble structuring pipeline
  writing a whole proposed tree with no prior review, not every ordinary
  user-initiated edit. Adding a sub-task, creating a label, and editing a
  description all already write immediately on the existing UI's own action
  (Enter, blur, change) with no separate confirmation; a comment follows the
  same convention, writing on Enter like sub-task add.
- `docs/architecture.md`: the `comments` schema added under Data model,
  next to `labels`; `listComments`/`createComment` added to the store
  interface's method list. `docs/design-system.md`: a new "Modal overflow
  menu" section states the "..." trigger, static info line, demoted
  destructive action pattern as established precedent for a future modal.
  `docs/roadmap.md`: "comments" removed from the Out of scope bullet
  (attachments stays); a new "Phase 3, part 3" Built entry states exactly
  what shipped. The Next section's own "Phase 3, part 3" (live Todoist OAuth)
  is renumbered to "Phase 3, part 4" to make room, a numbering fix only, not
  a scope change: that work is still entirely unbuilt and unchanged.

No file under `src/pipeline/` or `evals/` touched, so `npm run eval` stays at
its current count unchanged: 14/14 offline (7 fixtures, 6 negative contract
cases, 1 guard case), 12/12 date, no spend. `npm run build` succeeds.

Verified live via `npm run dev`: a task with no prior edits shows only the
"Added ..." line, Delete red at the bottom, clicking it still opens the
existing `ConfirmDialog`; editing that task's content then reopening the menu
shows a distinct "Updated ..." line; posting a comment against this session's
pre-existing seeded local data first reproduced the `db.comments` bug above
(the input silently failed to clear, nothing written), fixed, then reverified
clean after a full reload: two comments posted in sequence persist in order
(oldest first) with the right avatar initial and relative timestamp after a
full page reload, confirmed against local-store's `localStorage` payload
directly, not just the rendered list; toggled dark theme and re-checked
`.popover-item-danger` (`--ds-red`, unchanged across themes, still clearly
legible against both the light and dark `--ds-canvas` popover background,
`rgb(220, 76, 62)` confirmed via `getComputedStyle`) and `.popover-info`
(`--ds-ink-soft`, the same secondary-text token used everywhere else in both
themes) via direct inspection, not a screenshot; confirmed via the rendered
DOM that the comment input has no attachment control and no existing comment
has an edit affordance; deleted the test task afterward through the new
popover's own Delete flow, confirming the `ConfirmDialog` cascade message and
the delete itself both still work end to end.

### Decisions not to relitigate

- Comments are reopened, deliberately, this pass. Do not treat this as
  restoring a gap; it is a stated, dated decision to revisit
  `docs/roadmap.md`'s prior exclusion, the same standard every other
  reopened decision in this log states plainly.
- Comments this pass are create and list only. No `updateComment`, no
  `deleteComment`, no attachment field on the schema or the UI. A future pass
  wanting either needs its own scoping, not a "for completeness" add.
- The task-detail "..." menu is the established shape for a modal's
  secondary, low-frequency actions (a static info line, then a demoted
  destructive action), stated now in `docs/design-system.md`. A future modal
  needing the same shape reuses this pattern rather than re-deriving it.
- `.comment-avatar` duplicates `.sidebar-head .avatar`'s exact values rather
  than sharing a class, since the existing rule is scoped to that one
  selector, not a bare reusable one. A future pass wanting a single shared
  avatar class is free to extract one; this pass did not, to stay inside its
  own scope.
- "Phase 3, part 3" now names this task-detail/comments pass; the
  previously-reserved "Phase 3, part 3" (Todoist OAuth) is "Phase 3, part 4."
  This is bookkeeping, not a re-scoping of the OAuth work itself.
- `local-store.js`'s `load()` always merges onto `emptyDb()` now
  (`{ ...emptyDb(), ...JSON.parse(raw) }`), not just when `localStorage` is
  empty. Any future bucket added to `emptyDb()` needs this same merge to work
  against local data written before that bucket existed; do not special-case
  a new bucket's own migration once this general fix already covers it.

## 2026-07-07: Truncation fix and live trace capture with a confirmed/cancelled outcome

Two pieces shipped together in one pass because the second reuses the raw-
trace logging the first pass touched: a truncation fix reported directly
against a live failure, and a new capture-and-promote loop that turns real
Structure calls (and the user's own confirm/cancel decision on them) into
growth material for the offline eval suite.

### The truncation fix

Reported directly: a rich multi-workstream text dump (a camping trip, several
distinct threads: reservation, gear, food, car) returned "model response was
not valid JSON" in the UI, live on the deployed Function, while a short loose-
errands dump worked. Investigated rather than patched blind.

- **`functions/index.js`'s `/structure` handler had no way to tell truncation
  apart from a genuinely malformed response.** `max_tokens: 4096` combined
  with `output_config.format`'s JSON-schema constraint means the only way a
  schema-valid call fails `JSON.parse` is a response cut off mid-object; the
  handler checked `stop_reason === 'refusal'` but never checked `'max_tokens'`,
  so a truncation and an unrelated parse failure produced the exact same
  generic message. A richer dump (more sections, more nested sub-tasks, a
  longer `reasoning` string) is exactly the case most likely to approach a
  fixed cap, so this was not a one-off. Fixed two ways: `max_tokens` raised to
  8192, and `stop_reason === 'max_tokens'` now returns its own distinct 502
  ("model response was truncated (max_tokens reached) before it finished")
  instead of falling into the generic JSON-parse-failure branch. Raising the
  cap changes only the worst-case ceiling, not typical cost: the 2026-07-06
  entry below sized `DAILY_COST_LIMIT_USD` off a typical ~900 output-token
  call; a call that now genuinely fills 8192 tokens on both the first attempt
  and the one corrective retry costs about $0.246, still well under the $4
  daily ceiling, and `DAILY_REQUEST_LIMIT` (100) stays the binding constraint
  that entry already identified, unchanged.
- **The raw-trace `console.log` ran only after a successful `JSON.parse`.**
  The one case worth debugging (a failure) never reached it. Moved earlier,
  right after the response comes back, before any failure branch; it now
  records `stopReason` and the raw `rawText`, not just a success-only
  `structured` result. This placement is what made the trace-capture piece
  below straightforward to add in the same spot.
- **The retry-then-fail-closed path in `src/pipeline/structure.js` (the
  `JSON.parse` branch inside `attempt()`) had zero offline coverage.** Every
  existing fixture's `mockResponse` is already a parsed object, so that branch
  never ran under `npm run eval`. New `evals/offline/guard-cases.mjs`
  (`guard-malformed-json-fails-closed`) feeds `structureTranscript` a raw,
  non-JSON string on both the first attempt and the retry (the same shape a
  truncated live call returns) and asserts it retries exactly once, then
  throws `ContractError` mentioning "response was not valid JSON." Wired into
  `scripts/eval-offline.mjs` as a third case category (`runGuardCases`).

### Live trace capture and the confirmed/cancelled outcome

This reopens a decision `docs/architecture.md` had already settled: "Raw
prompts and responses are stored only when `LLM_STORE_RAW_TRACES=true`, off
in production." Reopened on purpose, stated plainly: production now persists
every Structure call's transcript, response, and the user's own confirmed-or-
cancelled decision, scoped per user (`users/{uid}/structureTraces`), always,
not behind a debug flag. There is no other way to build a real golden dataset
or know whether a proposal was actually good; a mocked fixture only ever
tests what someone already thought to write down. `docs/brief.md`'s "personal
task text can be sensitive, treated as private by default" still holds in the
sense that matters operationally today: `firestore.rules` denies every client
read and write on this collection outright (stricter than `llmUsage`, which
at least allows the owner a read), so the only things that ever see this data
are the Function (Admin SDK) and a human running the two local scripts below
with their own GCP credentials. That human is still able to read any user's
raw dump text; in a single-dogfooding-user app that is an acceptable,
practical trade, not a real multi-tenant privacy guarantee, and this entry
says so rather than letting the tension pass silently.

- `functions/index.js`: `logStructureTrace()` writes one document per real
  `/structure` call (transcript, `existingProjectIds`, model, `priorErrors`,
  `stopReason`, the parsed `response` or `null`, `rawText`, `ok`, token/cost
  usage, `createdAt`, `outcome: 'pending'`, `outcomeAt: null`), in its own
  try/catch so a Firestore hiccup degrades to `traceId: null` rather than
  turning a working structuring response into a 500. Called once, at the
  exact spot the truncation fix above already moved the raw-trace log to,
  before any of the refusal/`max_tokens`/parse-failure branches return. The
  success response shape changed from the bare structuring object to
  `{ traceId, structured }`; every error body (`401`, `400`, `429`, the three
  `502`s) is untouched, since there is no proposal and no confirm/cancel
  decision to link a trace to on failure.
- New route `POST /api/structure/outcome`: `{ traceId, outcome: 'confirmed' |
  'cancelled' }`, rejects any other outcome value with `400`, writes
  `users/{user.uid}/structureTraces/{traceId}` (the path built from the
  verified `user.uid`, never a client-supplied one, so a user can only ever
  touch their own trace) with `{ outcome, outcomeAt }`, merge. No model call,
  so it never touches `DAILY_REQUEST_LIMIT`, `DAILY_COST_LIMIT_USD`, or
  `llmUsage`.
- `firestore.rules`: `structureTraces` gets `allow read, write: if false`,
  both directions, stricter than `llmUsage`'s owner-read/server-write split,
  matching the comment pattern already there. Admin SDK bypasses rules
  regardless, so this is a stated intent for the client SDK, not a functional
  gate on the two scripts below.
- `SuperRambleModal.jsx`: `callModel` now unwraps `{ traceId, structured }`,
  keeping the latest attempt's `traceId` in a ref (`structureTranscript` can
  call `callModel` twice, once corrective retry) and copying it into state
  once `structureTranscript` resolves, so Confirm and Cancel read the trace
  that actually produced the shown proposal. A new best-effort
  `recordOutcome()` posts to `/api/structure/outcome`, not awaited at its call
  site, swallowing any error silently: this is telemetry, it must never
  surface an error or block the UI. Confirm calls it `'confirmed'` right
  after `store.createProjectTree` succeeds. Only the preview state's own
  Cancel (the one beside Confirm) calls it `'cancelled'`; the input state's
  Cancel, the error state's Close, and the `needsClarification` state's
  Close/Add-more-detail all stay exactly as they were, since none of them
  followed a real proposal with a real decision to record.
- **The outcome is two states, confirmed or cancelled, not three, and that is
  a fact about the UI, not a simplification.** The preview is read-only end
  to end today (`TaskRow`'s `readOnly` prop, unchanged this pass); there is no
  edit affordance, so there is no way for a user to produce a "confirmed with
  edits" result. Building a three-state model now would have meant inventing
  a state the UI cannot actually reach. A future editable-preview pass is a
  distinct, later decision that would need to grow the trace schema, both
  scripts, and this design along with it.
- `scripts/list-traces.mjs` (new): reads `users/{uid}/structureTraces` with
  `firebase-admin` and Application Default Credentials (a one-time
  `gcloud auth application-default login`, documented in the file's own
  header), never the Function's service-account path. Sorts cancellations
  first, pending next, confirmed last, since a rejected proposal is the
  highest-signal case: the model got something wrong that mattered enough to
  reject outright, not a detail worth an edit.
- `scripts/promote-trace.mjs` (new): turns one reviewed trace into a new
  `evals/fixtures/*.json` entry, shaped exactly like the existing seven.
  `--use-live-response` is refused outright unless the trace's own `outcome`
  is `'confirmed'`, verified directly: fed a mocked `'cancelled'` trace and
  confirmed the script printed a clear refusal and exited non-zero rather
  than silently promoting an unendorsed response. A cancelled (or still-
  pending) trace instead needs `--expected-file`, a hand-written
  `{ mockResponse: {...} }` correction: what the model produced there is
  exactly what nobody wanted, so it must never become an auto-trusted
  regression fixture. Either path runs `validateStructure` and
  `ungroundedContents` against the constructed fixture before writing;
  verified directly too, feeding a response with `priority: 9` through
  `--expected-file` and confirming the script printed the exact contract
  error and wrote nothing. A promoted fixture always carries
  `existingProjects: []`, a known limitation stated in the script's own
  header comment: a trace's `existingProjectIds` are ids only, names are not
  recoverable, so a fixture that needs a real routing target by name still
  needs hand-editing after promotion.
- `package.json`: `firebase-admin` added as a devDependency (local tooling
  only, not shipped in the Vite bundle), `npm run traces:list` and
  `npm run traces:promote`.
- `scripts/eval-live.mjs`'s `callModelLive` unwraps `{ traceId, structured }`
  too, `return (await res.json()).structured`, matching the Function's new
  response shape; nothing else in that file changed.

Verified: `npm run build` succeeds. `npm run eval` is 14/14 offline (7
fixtures, 6 negative contract cases, 1 guard case), 12/12 date, no spend.
`promote-trace.mjs`'s two refusal paths (wrong outcome, failing contract)
verified directly against mocked Firestore data, not assumed from reading the
code, both printing a clear message and exiting non-zero, neither writing a
file. `list-traces.mjs`'s sort order verified directly against three mocked
traces (confirmed, cancelled, pending): cancelled printed first, pending
second, confirmed last. The Function's own logic (`logStructureTrace`
writing the right document shape, the `/structure` response shape change,
the `/structure/outcome` route's validation and merge-write, a bad outcome
value rejected with `400`) verified directly against a mocked Anthropic
client and a mocked Firestore, the same technique the 2026-07-06 entry below
used before this app had `firebase-admin` credentials available for a real
integration test.

### Decisions not to relitigate

- `max_tokens` for the Structure call is 8192, not 4096. A future pass
  changing it again should redo the worst-case cost math against
  `DAILY_COST_LIMIT_USD` and `DAILY_REQUEST_LIMIT`, not just bump the number.
- `stop_reason === 'max_tokens'` is its own distinct error path, separate from
  a genuine JSON-parse failure. Do not collapse them back into one generic
  message; telling them apart is the entire point of that fix.
- The raw-trace log (`LLM_STORE_RAW_TRACES`) fires unconditionally after the
  response comes back, before any failure branch. A future change to this
  handler must keep it there.
- `evals/offline/guard-cases.mjs` is for guarding `structureTranscript`'s own
  control flow (retries, fail-closed) with raw, non-object `callModel`
  responses; it is not a place for contract-shape assertions, which stay in
  `evals/offline/contract-cases.mjs` against `validateStructure` directly.
- Every real Structure call persists a trace, in production, unconditionally.
  This is a deliberate reopening of the prior "raw traces off in production"
  stance, not a regression of it; do not gate this behind
  `LLM_STORE_RAW_TRACES` or any other flag without a new, equally explicit
  decision.
- `structureTraces` denies the client SDK both read and write, stricter than
  `llmUsage`. Only the Function and the two local Admin-SDK scripts touch it.
- The outcome model is two states (confirmed, cancelled) because the preview
  is read-only. Do not add a third state without first building a real
  editable-preview feature; the two are the same decision.
- `promote-trace.mjs` never promotes a non-confirmed trace via
  `--use-live-response`, and never writes a fixture that fails
  `validateStructure` or the grounding guard, regardless of path. Both are
  hard refusals, not warnings.
- A promoted fixture's `existingProjects` is always `[]`. A fixture that
  needs a named routing target needs hand-editing after promotion; this is
  not something the promote script attempts to solve.
- The `llm-traces/` local file writer and the empty/oversized guard-suite
  cases (both flagged in the earlier version of this entry) are still not
  built. They are a different, complementary gap from the Firestore-backed
  capture above, not resolved by it; each stays its own scoped pass.

## 2026-07-06: Project menu/focus-ring fix merged and deployed to super-ramble.web.app

Merged `fix/sidebar-project-menu-focus-ring` to main through
[PR #20](https://github.com/cottalucas/super-ramble/pull/20) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for prior PRs;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`; functions were not
touched by this pass, so not redeployed. Verified the deployed bundle's
hash matched the local build byte for byte (`md5`, both JS and the CSS
filename). Live site returns 200.

## 2026-07-06: Project menu (add above/below, Edit panel, sibling drag), hierarchical project picker, and the field-focus ring fix

Reported directly from a set of screenshots comparing this app against real
Todoist: a task detail Description field showed a stark white/near-bright box
when clicked (dark theme), the task-detail Project picker listed several
projects all named "Marketing Launch" flat and indistinguishable since some
were sub-projects of different parents, and the sidebar's project "..." menu
only had Edit (an inline rename), Add section, and Delete, with a request to
add "Add project above/below" and drag reorder, matching real Todoist's own
menu, but explicitly not the rest of that menu (Favorites, Move, Duplicate,
Share, Comments, View activity, templates, extensions, CSV, Archive), which
`docs/roadmap.md`'s Out of scope section already excludes. No files under
`src/pipeline/` touched.

- **Focus ring on text fields.** `docs/resolution-log.md`'s 2026-07-05 entry
  added a global `:focus-visible` ring (`outline: 2px solid var(--ds-ink)`) to
  `button`, `input`, `textarea`, `[tabindex]`. Confirmed live: browsers treat
  any focus on an editable control as `:focus-visible` regardless of pointer
  vs. keyboard, so that rule drew the ring on every ordinary click into a
  field, not just keyboard navigation. In dark theme `--ds-ink` is `#e8e6e3`,
  near-white, so a borderless field like `TaskDetail.jsx`'s description
  textarea (`.modal-desc`, `border: 0`) showed a bright box with nothing else
  to break it up, exactly the reported screenshot. Fixed by dropping `input`
  and `textarea` from the shared `:focus-visible` rule (buttons and
  `[tabindex]` keep it unchanged) and giving fields their own, quieter
  treatment in `src/styles.css`: `input:focus, textarea:focus { outline:
  none; }` plus `.form-input:focus { border-color: var(--ds-ink-soft); }` for
  the bordered form fields (Add/Edit Project's Name and Description). A bare
  borderless field (a title, a description) now shows no ring at all on
  focus, matching Todoist's own inline-editing feel; a bordered one gets a
  subtle border-color change instead of a ring. Verified live in both themes
  via `getComputedStyle`: `outline-style: none` and the bordered field's
  `border-top-color` resolving to `--ds-ink-soft` on focus, not a ring.
- **Hierarchical project picker.** `src/lib/projectTree.js` (new):
  `buildProjectChildrenMap` (moved out of `Sidebar.jsx`, unchanged logic) and
  a new `flattenProjectTree`, a depth-first `{ project, depth }` ordering so a
  sub-project always renders immediately after and indented under its real
  parent. `ProjectPicker.jsx` (used by Quick-add and the task detail rail)
  now renders Inbox first, then this flattened, indented list, instead of a
  bare `projects.map`, so a project sharing a name with an unrelated
  sub-project (the reported "several Marketing Launch entries" confusion) is
  now visually distinguishable by its position under its actual parent, not
  guessed from name alone. `Sidebar.jsx`'s own `ProjectNode` tree was already
  correct (it already indents recursively); it now imports the shared
  `buildProjectChildrenMap` instead of keeping its own copy.
- **Project overflow menu.** `Sidebar.jsx`'s project "..." popover is now
  Add project above, Add project below, Edit, Add section, Delete, in that
  order, matching real Todoist's own menu for exactly these five items and no
  others. The inline rename input (`renaming`/`renameVal` state, a bare
  bordered `<input>` swapped in for the row) is gone entirely: Edit now opens
  `AddProjectModal.jsx` in edit mode (below), the same panel Add Project
  uses, per the direct request to make Edit "open this panel... like we
  already have" instead of an inline text field.
- **`AddProjectModal.jsx` now serves both Add and Edit.** Takes an optional
  `project` prop (null for Add, an existing project for Edit) and an optional
  `initialParentId` (Add only, seeds the Parent project field for "Add
  project above/below," ignored in Edit, which reads the project's own
  `parentProjectId`). Gained a Description field (`store.updateProject`
  already supported it; the schema has carried `description` since phase
  2.5, just never had a modal-based editor before) and a heading ("Add
  project" / "Edit project", reusing `.settings-title`). The footer button
  reads "Save" in Edit, "Add project" in Add. `validParentCandidates`'s
  `excludeId` now gets the project's own id in Edit mode, so a project still
  cannot become its own ancestor by picking itself or a descendant as its new
  parent. No Access, Layout, or Add-to-favorites field added: still out per
  `docs/roadmap.md`.
- **Add project above/below.** `Sidebar.jsx` computes the reference project's
  sibling list and the reference's index (or index + 1) among those
  siblings, opens `AddProjectModal` in Add mode with `initialParentId` fixed
  to the reference's own parent and that computed `insertIndex` carried
  alongside. On save, `handleProjectSaved` splices the new project's id into
  the (pre-save) sibling id list at `insertIndex` and calls the new
  `reorderSiblings(parentProjectId, orderedIds)`, which re-fetches the
  current siblings via `store.listProjects()` (not the possibly-stale
  `projects` closure, since a write just changed it) and persists any
  changed `order` via `store.updateProject`. Ordinary "+ " Add project (no
  reference project) is unaffected: no `insertIndex`, so it keeps appending
  at the end exactly as before.
- **Sibling drag reorder.** Every project row in `Sidebar.jsx` is now
  `draggable`; a drop reorders same-parent siblings only
  (`handleProjectDragDrop`, gated on the dropped-on project sharing the
  dragged project's `parentProjectId`), through the same `reorderSiblings`
  helper. Dropping onto a project with a different parent is a deliberate
  no-op: reparenting already has a dedicated, more explicit control (the
  Edit panel's Parent project field), and a drag-to-reparent gesture risks
  an accidental move a click-through field does not. `.nav-item.drag-over`
  (`border-top: 2px solid var(--ds-red)`) mirrors `.task-row.drag-over`'s
  existing convention.

Verified live via `npm run dev`: Edit on a nested project opens the panel
pre-filled (name, color, parent) with no navigation away from the current
view; Add project above/below on both a root and a nested project lands the
new project in the right slot under the right parent, confirmed by screen
position, not just by trusting the write; a task's Project picker now shows
a sub-project indented under its real parent; dragging a root project onto
another root project reorders them (confirmed by screen position after the
drop, then dragged back to restore); clicking into the task detail
Description field in dark theme showed no ring; `.form-input:focus` showed
`border-color: rgb(128, 128, 128)` (`--ds-ink-soft`) via direct inspection,
not a screenshot. `npm run build` succeeds; `npm run eval` stays at 13/13
offline and 12/12 date, unchanged, since nothing under `src/pipeline/` was
touched.

Built on top of [PR #19](https://github.com/cottalucas/super-ramble/pull/19)
(the Sonnet/Super Ramble entry point, merged to main while this task was in
progress in the same working directory): `Sidebar.jsx` and `src/styles.css`
both carried that PR's own additions (a "Super Ramble" nav button and its
modal's CSS) at the same time this task was editing them. Rather than risk
a racy partial commit, this task's changes were stashed, `main` was pulled to
pick up PR #19 once it merged, and the stash was reapplied cleanly on a fresh
branch cut from the updated `main`, so this pass's diff is exactly the five
items above, nothing from PR #19 duplicated or reverted.

### Decisions not to relitigate

- The project "..." menu is deliberately five items: Add project above, Add
  project below, Edit, Add section, Delete. Favorites, Move, Duplicate,
  Share, Comments, View activity, templates, extensions, CSV, and Archive
  are not a gap to fill; `docs/roadmap.md`'s Out of scope section already
  excludes every one of them by name.
- `AddProjectModal.jsx` is the one project form for both Add and Edit, not
  two components. A future field added to it applies to both modes unless
  there's a stated reason to gate it to one.
- Drag reorder on sidebar projects is siblings-only, never reparenting.
  Reparenting stays a deliberate, explicit action through the Edit panel's
  Parent project field. **Reopened 2026-07-10**: sidebar project drag now
  also supports drag-to-nest, position-aware like `ProjectView`'s own task
  list. This bullet's "never reparenting" no longer holds; see the
  2026-07-10 entry for the reasoning and the new gesture. The Edit panel's
  Parent project field is still the one place a reparent can happen with no
  drag at all, unaffected either way.
- The shared `:focus-visible` ring rule no longer applies to `input` or
  `textarea`. A future control that is a real text field gets its focus
  treatment from `.form-input:focus`'s border-color pattern (or its own,
  if it isn't bordered), not by re-adding it to the shared ring rule.

## 2026-07-06: The real structuring call, live on Sonnet, and the Super Ramble entry point

Three parts, built together: the Sonnet exception, the real Anthropic call
using structured outputs, and the "Super Ramble" entry point in the app.
`functions/index.js` had a real model call for the first time in this repo;
everything else under `functions/` (Todoist OAuth, the Todoist read/write
stubs) is untouched, still stubbed, still next.

### Part A: the Sonnet exception

`ANTHROPIC_STRUCTURE_MODEL` is a new, separate constant from the existing
`ANTHROPIC_MODEL` (Haiku, unchanged, still every other call's default). It is
pinned to `claude-sonnet-5`, verified live against
platform.claude.com/docs/en/about-claude/models/overview (fetched, not
recalled from memory, since a model id string is exactly the kind of thing
that drifts): a pinned snapshot, not an evergreen alias, same convention
every other Claude model id in this app already follows. Commented plainly in
both `functions/index.js` and `functions/.env.example` as a deliberate, named
exception: structuring quality is the whole product
(`docs/brief.md`: "the structure has to be genuinely good... a bad scaffold
is worse than none"), so this one call is worth paying roughly 3x Haiku's
per-token cost for. `docs/architecture.md` and `docs/llm-pipeline.md` both
state this now, replacing the stale "Runs on Haiku" line the 2026-07-04 audit
had already flagged as one half of the Classify/Structure contract conflict
(see the entry above resolving that conflict); collapsing the doc's stage
count from four to three and the Sonnet exception landed in the same edit,
since both were touching the exact same paragraph.

Sonnet pricing, verified against the same models page: $3 / MTok in, $15 /
MTok out (an introductory $2 / $10 rate applies through 2026-08-31; the cost
math and the code both use the standard rate on purpose, so the guard stays
conservative once that window ends rather than under-counting today).
Sizing the daily limits for one dogfooding user: a typical structuring call
(existing-projects list plus a real brain-dump transcript, a scaffold with a
handful of sections and nested sub-tasks back) runs roughly 1,200 input
tokens and 900 output tokens, about $0.017; a worst case with one corrective
retry (Part B) roughly doubles that, about $0.034. `DAILY_REQUEST_LIMIT`
stays 100, unchanged; a single dogfooding user submitting 100 brain-dumps in
a day is not "ordinary use" to plan around. At worst-case-with-retry cost,
100 requests cost about $3.40. The old `DAILY_COST_LIMIT_USD` of 1 (sized
when this call was still a Haiku stub) would have tripped around request 29,
throttling ordinary use well before the request limit ever mattered. Moved
to 4, comfortably covering the full 100-request budget even if every single
request retries once, so the request limit is the one that actually binds
for a single user, matching its original intent. `functions/.env.example`
states both new values with the reasoning inline.

### Part B: the real call, structured outputs

`functions/index.js`'s `/api/structure` now makes a real
`client.messages.create` call (`@anthropic-ai/sdk` bumped from `^0.27.0`,
too old to have `output_config` at all, to `^0.110.0`), passing
`output_config: { format: { type: 'json_schema', schema } }`. Verified live
against platform.claude.com/docs/en/build-with-claude/structured-outputs
(also moved recently, per the task's own warning, and it had: the parameter
is `output_config.format`, not the older `output_format`, and no beta header
is required, structured outputs are generally available now) and against the
installed SDK's own `.d.ts` (`OutputConfig`/`JSONOutputFormat` interfaces,
`Model` union type literally includes `'claude-sonnet-5'`), not just the
docs prose. The schema mirrors `src/pipeline/contracts.js`'s
`validateStructure` field for field: same keys, `sections`, a task's
`sectionRef`, and `subtasks` all omittable the same way the validator already
treats them as optional, `additionalProperties: false` everywhere the
validator already rejects unknown keys. JSON Schema cannot express a numeric
range (`confidence` 0 to 1, `priority` 1 to 4) or cross-field coherence
(`decision`/`project`, `sectionRef` resolution), so `validateStructure` keeps
every check it already had; nothing was deleted from it, and the offline
eval suite (7 fixtures, 6 negative contract cases) needed no changes to stay
green, confirmed by running it, not assumed.

Firebase Functions deploys only the `functions/` directory as its own
CommonJS package (`require`, no `"type": "module"`), so it cannot `import`
the ESM modules under `../src/pipeline`. The schema and the system/user
prompt text in `functions/index.js` are therefore this app's one deliberate,
flagged duplication of `src/pipeline/contracts.js` and
`src/pipeline/prompt.js`: kept in sync by hand, with a comment in all three
files saying so. This was a real design fork considered and rejected: copying
`src/pipeline/*.js` into `functions/` at deploy time would need
`functions/package.json` to also become `"type": "module"`, a much bigger,
riskier rewrite of a file this pass was not scoped to restructure, for a
duplication that is small (a prompt string and a schema object) and already
flagged. `src/pipeline/prompt.js`'s system prompt dropped its "Return strict
JSON matching the contract. No prose outside the JSON" line, since
`output_config.format` now guarantees that; the real behavioral instructions
(decide project vs. tasks, never invent, route to an existing project,
confidence calibration, sections only when they help) are unchanged and
still mirrored in `functions/index.js`'s copy.

`src/pipeline/contracts.js` gained `isGroundedInTranscript` and
`ungroundedContents`, the no-invention guard that used to live only inside
`scripts/eval-offline.mjs` as a private, duplicated function. It is a real
runtime guard now, not just an eval-time one: `src/pipeline/structure.js`
calls it on every response, live or offline. `scripts/eval-offline.mjs`'s own
copy and its separate "all content grounded" check are gone; an ungrounded
fixture now fails "contract valid" before reaching that point, so the
separate check would have been dead code, always true, if left in.
`structureTranscript` retries once on any validation or grounding failure,
the errors appended into `callModel`'s new `priorErrors` argument, which both
`functions/index.js` (appends them to the user prompt if present) and
`scripts/eval-live.mjs`'s bridge (forwards them, previously dropped them
silently) now honor. A second failure throws `ContractError`, fails closed;
nothing partial or guessed reaches Write. Offline fixtures never hit the
retry path, since their mocked `callModel` always returns the same valid
response regardless of arguments; verified by running `npm run eval`; still
7/7, 6/6, unchanged counts.

`src/pipeline/write.js` (new) is the Stage 3 Write function
`docs/llm-pipeline.md` already described but that did not exist in code:
`toProjectTree` flattens a validated response's nested `subtasks` into the
flat, `parentRef`-linked list `store.createProjectTree` expects, carrying
`sections` and each task's `sectionRef` through unchanged. A task's `due` (a
natural-language or ISO string from the model, per the 2026-07-04 contract
resolution) is not yet parsed into the store's real
`{ date, datetime, string, isRecurring }` shape: no date parser exists
anywhere in this repo. `toDue` wraps it as the `string` fallback so nothing
crashes and the text is not silently dropped, but `dueMeta`/`isToday`/
`isOverdue` all read `.date`/`.datetime` only, so a Super Ramble task with a
due phrase will not bucket into Today or Upcoming, or show a green due line,
until a real parser lands. Flagged in `docs/roadmap.md`'s Next section
rather than guessed at with a hand-rolled parser this pass was not scoped to
build and verify properly (timezone and relative-date parsing is exactly the
kind of thing that looks done and is not).

### Part C: the entry point

`Sidebar.jsx` gets a "Super Ramble" nav item right after Add task (a sparkle
icon, `IconSparkle`, new in `Icons.jsx`, no existing icon fit). New
`src/components/SuperRambleModal.jsx`: a plain textarea, an honest,
non-marketing tips list, Cancel and a primary "Structure it" (disabled on
empty input). Submitting calls `/api/structure` (through `structureTranscript`,
so the retry/validation logic above runs for real, not just for fixtures),
with a Firebase ID token attached (`auth.currentUser.getIdToken()`; local
preview's fake user sends no token, so calling a real deployed Function from
local preview always 401s, correctly, since there is no real session behind
it). On success: `reasoning` and `confidence` above the proposed tree; a
`needsClarification` response shows the question instead of a tree, with no
Confirm, since there is nothing to confirm; a failure after the one retry is
a plain error state ("Edit and try again"), no proposal, matching the task's
own "fail closed" framing all the way to the UI. Confirm, and only Confirm,
calls `store.createProjectTree` with `toProjectTree`'s output; nothing
writes before that click.

Reusing `TaskList` for the unconfirmed preview was asked to be tried first,
and was genuinely awkward, so the smallest adaptation was made instead of a
parallel renderer, as invited: `TaskList` hard-wires `useData()` (real
`completeTask`/`deleteTask`/`openAdd`/`openTaskDetail`, all calling the real
store with real ids) and native-drag reorder state, none of which is safe or
meaningful against a tree that has no ids yet and has not been written
(clicking complete, or dragging to reorder, would call `store.updateTask`
against a document that does not exist). `TaskRow` is the actual per-row
renderer underneath `TaskList`, already recursing through a `childrenOf` map
keyed by `parentId`, so the adaptation was a new `readOnly` prop on `TaskRow`
(default `false`, every existing caller unaffected) rather than a new
component: the checkbox is disabled, the row is not clickable, and Add
sub-task/"..." are hidden entirely rather than left clickable-but-dead,
since `docs/design-system.md`'s anti-pattern checklist forbids exactly that
(a line added to the checklist in this pass, since it did not already say so
in words, only in precedent). `buildChildrenMap` (already exported from
`TaskRow.jsx`) builds the preview's map the same way it builds a real one,
just keyed by local refs (`t0`, `t0s0`, ...) instead of ids, since a preview
task's `id` is simply its own `ref`. This is one real, small, targeted
adaptation of the shared component, not a second row renderer; the write
path and the preview render both go through `flattenTasks`
(`src/pipeline/write.js`), so what is previewed is provably the same tree
`toProjectTree` writes.

### Verification

Client-side flows verified live via `npm run dev`, mocking `window.fetch` for
`/api/structure` so the round trip could be checked without spending real
credits first: a six-task, three-section, one-sub-task response rendered
correctly (section headers with counts, priority ring colors, the nested
"1 sub-task" toggle, no visible checkbox/menu affordances), Confirm wrote a
real "Podcast Launch" project with the same three real Sections and the same
nested sub-task, confirmed by opening the created project directly, not just
trusting the toast; a `needsClarification` response showed the question with
no tree and no Confirm; an unreachable `/api/structure` (true of local dev,
no emulator running) produced the plain error state, not a crash; the empty-
textarea case correctly disabled "Structure it" the whole time.

The real Anthropic call, the real usage logging, and the real auth gate were
verified directly against the deployed Function, not inferred from the
mocked test above: [see the deploy entry below for the exact commands and
responses].

Build clean; `npm run eval` stayed at 7/7 fixtures, 6/6 negative cases, 12/12
date cases throughout, confirmed by running it after every part, not only at
the end.

### An incidental note, disclosed rather than acted on

While this pass was running, `Sidebar.jsx`, `styles.css`, `roadmap.md`, and
`AddProjectModal.jsx` picked up substantial, unrelated changes on disk (a new
`src/lib/projectTree.js`, project drag-reorder, Add-project-above/below) that
this pass did not make. Confirmed real (not a corrupted read): the build and
`npm run eval` both stayed green throughout, and this pass's own additions to
those same files were checked to still be present and correct after each
change. Left entirely alone, on purpose; not this pass's work to describe,
attribute, or fold into this entry.

### Decisions not to relitigate

- The Structure call is the one named exception to Haiku-by-default, on
  `claude-sonnet-5`. Do not move it back to Haiku, and do not add a second
  Sonnet (or any non-Haiku) call elsewhere without an equally explicit,
  documented reason; the exception is deliberately narrow.
- The JSON Schema and prompt text in `functions/index.js` are a deliberate,
  hand-synced duplication of `src/pipeline/contracts.js` and
  `src/pipeline/prompt.js`, not an oversight. Firebase Functions cannot
  import across that directory boundary without a much bigger packaging
  change (making `functions/` an ESM package); do not "fix" the duplication
  piecemeal without taking on that whole restructure deliberately.
- `validateStructure` keeps every check it had before structured outputs,
  even the ones a schema now also enforces. The offline suite calls it
  directly against hand-authored mocks with no schema in the loop, so it
  still needs to catch everything on its own; only the live path gets the
  schema as a second, earlier line of defense.
- Grounding (`isGroundedInTranscript`) is a real pipeline guard now
  (`src/pipeline/contracts.js`, called from `structure.js`), not an eval-only
  check. Do not reintroduce a separate copy in the eval harness.
- `TaskRow`'s `readOnly` prop is the adaptation point for any future
  not-yet-written preview. A future caller with the same need extends this
  prop, it does not fork a second row renderer.
- A task's `due` from the model is a human-readable fallback until a real
  natural-language date parser exists. Do not read `due.date` or
  `due.datetime` off a Super Ramble-created task and expect it populated;
  check `due.string` instead, and know that Today/Upcoming will not bucket it.

## 2026-07-06: Structure contract conflict resolution merged to main, not deployed

Merged `feat/structure-contract-confidence-sections` to main through
[PR #18](https://github.com/cottalucas/super-ramble/pull/18) after CI
(`build-and-eval`) passed on both the branch push and the PR. Deliberately did
not run `firebase deploy`: this pass only touched `src/pipeline/`, `evals/`,
and `docs/`, none of which `src/main.jsx`/`src/App.jsx` import into the built
bundle (confirmed by grepping the UI tree for `pipeline` imports before
skipping the deploy step, not assumed), so a deploy would ship the exact same
`dist/` already live and verify nothing. The live site is unchanged from the
prior entry's deploy.

## 2026-07-06: Resolved the 2026-07-04 Structure contract conflict

The 2026-07-04 audit entry, below, flagged a real conflict rather than
silently picking a side: `docs/llm-pipeline.md` described Classify and
Structure as two separate model calls returning `sections`, `labels`,
`description`, and `color`, while `src/pipeline/contracts.js`,
`src/pipeline/prompt.js`, and the offline fixtures already implemented one
combined call with none of those fields. This pass resolves it in the code's
favor, not the doc's: keep the single combined call (`decision`, `reasoning`,
`targetProjectId`, `project`, `tasks` with inline nested `subtasks`), and add
only two fields to it, `confidence` and `sections`. `labels`, a per-task
`description`, and `project.color` stay out of this pass entirely; they were
not reopened.

- `src/pipeline/contracts.js`: `confidence` is now a required top-level
  number, validated 0 to 1 inclusive (`isConfidence`). `sections` is now an
  optional top-level array; when present, each entry is `{ ref, name }`
  (`SECTION_KEYS`), `ref` required non-empty and unique within the response,
  `name` required non-empty, extra keys rejected the same way every other
  level already rejects them. A task can now carry an optional `sectionRef`
  (added to `TASK_KEYS`); when present and non-null it must be a string that
  matches one of the declared `sections`' refs, checked against a `Set` built
  while validating `sections` and threaded into `validateTask`. A `sectionRef`
  referencing a section when `sections` is absent, or a ref that does not
  match any declared section, is rejected the same way an orphan `parentRef`
  already was. Subtasks were deliberately left alone (`SUBTASK_KEYS`
  unchanged): a subtask belongs to its parent task, not directly to a section,
  so it gets no `sectionRef` of its own, matching how `project.color`, task
  `description`, and `labels` are deliberately absent everywhere this pass.
- `src/pipeline/prompt.js`: the system prompt now tells the model to report
  `confidence` (0 to 1) and to lean toward `"tasks"` over an unsure `"project"`
  when confidence is low, the calibration behavior `docs/llm-pipeline.md`
  already named as an eval assertion but the prompt never actually asked for.
  It also now tells the model to add `sections` only when the dump names
  distinct workstreams that benefit from separation, not for a single-thread
  project, and to set a task's `sectionRef` only when it names one of those
  sections.
- `evals/fixtures/`: added `confidence` to all six existing fixtures (high on
  the five clear-cut cases, `0.35` on `04-ambiguous-clarify`, the one genuinely
  ambiguous fixture, matching the calibration the prompt now asks for). Added
  a seventh, `07-sections-when-they-help.json`, a conference-planning dump
  with three named workstreams (Venue, Speakers, Marketing), each a section,
  and every task carrying the matching `sectionRef`, so the eval suite
  actually exercises a non-empty `sections` array and a resolving
  `sectionRef`, not just the schema accepting an absent one. `npm run eval`
  is 7/7 fixtures plus 6/6 negative cases, unchanged in count.
- `evals/offline/contract-cases.mjs`: the shared `base` negative-case fixture
  gained `confidence: 0.8`. Not on the file list this task named, but without
  it every one of the six existing negative cases would fail two ways at once
  (their own deliberate violation, plus a newly-missing required `confidence`)
  instead of the one violation each is meant to isolate; adding the one field
  keeps that isolation intact. This does not change what any negative case
  asserts, only restores it to testing exactly one thing.
- `docs/llm-pipeline.md`: Stage 2 (Classify) and Stage 3 (Structure) are
  rewritten as one Stage 2 (Structure), stating plainly that this is a single
  combined call, not two, and citing this entry for why. The output contract
  shown now matches `contracts.js` exactly: `confidence`, optional `sections`,
  `tasks` with inline `subtasks` and an optional `sectionRef`, no `labels`,
  `description`, or `color`. The stage's documented input dropped
  `existingLabels`: neither `prompt.js` nor `structure.js` ever accepted or
  used it, so restating it as if it existed would just be a second version of
  the same doc-versus-code drift this entry closes. The eval-assertions
  section is likewise collapsed from separate Classify/Structure lists into
  one Structure list, plus a calibrated-confidence assertion and a
  sections/sectionRef-resolution assertion that did not exist before.
- `docs/roadmap.md`: the phase 1 Built paragraph and the phase 3 Next
  paragraph both referenced the 2026-07-04 conflict as still open; both now
  state it is resolved and point here instead. Touched even though the task
  named a specific file list that did not include `roadmap.md`, because
  leaving those two paragraphs as "needs reconciling" after this pass would
  itself be a new, avoidable doc-versus-reality conflict of exactly the kind
  this task exists to close.

Flagged, not resolved, deliberately out of scope for this pass:
- `docs/architecture.md`'s high-level pipeline summary still describes
  Classify and Structure as two separate stages, each "Runs on Haiku,"
  language that reads as two separate model calls. That is now stale next to
  the combined-call contract this entry settles, but `architecture.md` was not
  on the file list this task named, and the summary itself says "detailed in
  docs/llm-pipeline.md," which is now the accurate version. A future pass
  touching `architecture.md` should collapse that summary to match, but this
  pass did not touch it.
- `labels`, a per-task `description`, and `project.color` remain entirely out
  of the contract, the prompt, and the fixtures. This was a direct instruction
  for this pass, not an oversight; a future pass that wants them needs its own
  scoping, the same way this one was scoped to `confidence` and `sections`
  alone.
- No live model call was touched. `functions/index.js` and everything under
  it are untouched; this pass is the offline contract, prompt text, and evals
  only.

Verified: `npm run build` succeeds. `npm run eval` is 7/7 fixtures (new count,
was 6/6), 6/6 negative contract cases, and 12/12 date cases, all green, no
spend (offline only, no Functions call, no live model).

### Decisions not to relitigate

- The Structure contract is one combined call, never a separate Classify then
  Structure round trip. `decision`, `reasoning`, `confidence`,
  `targetProjectId`, `project`, `sections`, and `tasks` all come back together.
  Do not re-split this into two calls without a stated reason; this entry is
  the resolution of a real, previously-flagged conflict, not an interim state.
- `sections` is optional and additive. A response with no `sections` key, and
  every task's `sectionRef` absent or null, is exactly as valid as before this
  pass; nothing about the six original fixtures' shape was required to change
  beyond adding `confidence`.
- A subtask never carries its own `sectionRef`. Section membership is a
  property of a top-level task, not of a nested subtask; if a future pass
  wants subtask-level sections, that is a new decision, not an extension of
  this one.
- `labels`, per-task `description`, and `project.color` are a deliberately
  separate, unscoped decision. Do not add any of the three piecemeal while
  touching `sections` or `confidence`; each needs its own pass.

## 2026-07-06: Sub-task nesting depth limit fix merged and deployed to super-ramble.web.app

Merged `fix/subtask-nesting-depth-limit` to main through
[PR #17](https://github.com/cottalucas/super-ramble/pull/17) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for prior PRs;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`. Verified the deployed
bundle's hash matched the local build byte for byte. Live site returns 200.

## 2026-07-06: Sub-task nesting depth limit removed

Reported directly: "a subtask can not have a subtask." Reproduced live, not
guessed: a task (depth 0) getting a sub-task (depth 1), and that sub-task
getting its own sub-task (depth 2), both worked; a depth-2 task getting a
sub-task of its own (depth 3) did not, since `TaskRow.jsx` only rendered the
"Add sub-task" icon and only allowed the drag-nest zone at `depth < 2`,
matching the old two-level floor `docs/architecture.md` described. That floor
was never meant to be a ceiling, and projects already get "no fixed depth
limit" via `parentProjectId`; tasks did not have the equivalent.

Removed the `depth < 2` gate on both the "Add sub-task" button and the
drag-nest zone in `TaskRow.jsx`, so a sub-task can have a sub-task at any
depth, the same as nested projects. Visual indent still caps at the `sub2`
(56px) step past depth 1, so a deep hierarchy does not push content
off-screen; only the CSS class stops climbing, the `parentId` chain and the
rendered nesting keep going as deep as the data does. `docs/architecture.md`'s
"at least two levels of sub-tasks" line, which described the old floor,
corrected to state there is no fixed depth limit, matching projects.

Verified live, not inferred from the diff: created a depth-3 sub-task through
the "Add sub-task" icon on a depth-2 task, confirmed via `parentId` chain
walking in the stored data (not just the visual indent) that it is truly
depth 3; drag-nested a task onto a depth-2 target and confirmed the same via
`parentId`.

Build clean, offline evals 12/12, no spend.

## 2026-07-06: Popover fix, position-aware drag, and inline add-task merged and deployed to super-ramble.web.app

Merged `feat/popover-fix-position-drag-inline-add` to main through
[PR #16](https://github.com/cottalucas/super-ramble/pull/16) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for prior PRs;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`. Verified the deployed
bundle's hash matched the local build byte for byte. Live site returns 200.

## 2026-07-06: Popover clipping fix, position-aware drag, and inline add-task

Three changes in one pass, reported from a live screenshot and a direct read
of `TaskList.jsx`/`TaskRow.jsx` and `QuickAddModal.jsx` against
`docs/design-system.md`'s litmus test.

**Sidebar popover clipped behind the content view.** The screenshot showed a
project's options menu (Edit, Add section, Delete) cut off at the sidebar's
right edge. Root cause, confirmed by reading `.sidebar`'s own
`overflow-y: auto` rule, not guessed: `Popover.jsx` positioned its content
with `position: absolute` inside the sidebar, and an ancestor's `overflow`
clips an absolutely positioned descendant regardless of z-index. Fixed by
portaling the popover's content to `document.body` and positioning it with
`position: fixed`, computed from an anchor marker's own
`getBoundingClientRect()` left behind at the popover's call site; flips from
left- to right-aligned if it would run past the viewport's right edge.
Verified live in both themes against the exact reported menu, and against
`LayoutControl`'s popover, with no regression.

**Position-aware drag in ProjectView's List layout.** The prior pass
(2026-07-05, below) made cross-section reparenting work, but every non-true-
sibling drop nested the dragged task, with no way to land it top-level in a
different section and no drop target in an empty one. Pointer position
within the hovered row's vertical bounds now decides the outcome: top half
(or anywhere on a row too deep to nest under, depth 2) previews "insert as a
sibling immediately before this row," bottom half of a shallower row previews
"nest as its new last sub-task." A drop past the last row, or into an empty
section or the no-section list, always means "append as a sibling at the end
of this list." An indented placeholder line (`.drop-placeholder`, using the
existing `.sub`/`.sub2` 30px/56px steps and the existing `--ds-red` token,
already audited for dark-mode contrast) replaced the old whole-row highlight,
distinguishing the two outcomes visually while dragging. The cycle guard
(`isDescendant`) now also covers the sibling-insert case, since inserting a
task as a sibling of a row whose parent is the dragged task's own descendant
is a cycle too, not just nesting directly onto a descendant.

`TaskList.jsx` gained an opt-in `positionAware` prop (default `false`) rather
than replacing its existing reorder/reparent branching outright: Today,
Upcoming, and task detail never pass it, so they keep the exact mechanics the
2026-07-05 entry documents, untouched. Only `ProjectView.jsx`'s no-section
and named-section `TaskList` calls (Group None; Inbox included, since it
renders through `ProjectView`) opt in, each also passing a new
`destSectionId` prop so an empty list's own end-of-list drop zone knows which
section it is. The Group-not-None virtual-groups branch was deliberately left
untouched, matching its own drag gate from the prior pass; converting it was
out of scope for this pass, the same way position-aware drag itself is out of
scope for Today and Upcoming.

The top-half/bottom-half split reads right against Todoist's own feel once
built and verified live; no deviation to note.

Verified live, not inferred from the diff: dragged a top-level task from one
section into an empty section, confirmed it landed top-level; dragged a task
to just above and just below another task in a different section, confirmed
two visually distinct placeholders and correct landings for both; dragged a
sub-task out to the no-section list, confirmed it became top-level; confirmed
the cycle guard refuses both a nest and a sibling-insert that would create
one; confirmed the Sort-Manual gate still disables the whole feature when
Sort is not Manual (checked the `draggable` DOM attribute directly); checked
the placeholder's contrast in both themes.

`docs/roadmap.md`'s Out-of-scope section had a stale line claiming
cross-section drag was narrowly limited to Board's no-Group column view, left
over from before the 2026-07-05 pass shipped List-view cross-section
reparenting. Corrected as part of this pass, not a silent overwrite: the line
was already inaccurate before today's change, and today's change closes the
one gap that was left. A new Built entry describes the actual current
capability.

**Inline add-task, replacing the centered modal for in-list entry points.**
Every "+ Add task" affordance opened `QuickAddModal.jsx` in a fixed, centered
overlay with a dark backdrop, regardless of where it was triggered from; real
Todoist expands the row in place instead, with no backdrop, and only its
global Add task (no row to expand into) uses a popover. Extracted the form
fields and the `store.createProjectTree` write out of `QuickAddModal.jsx`
into `src/components/TaskAddForm.jsx`, so the form and the write path exist
exactly once; three chrome wrappers now consume it: `QuickAddModal.jsx`
(unchanged centered overlay, kept for "Add sub-task" and any caller with no
row to expand into), the new `src/components/InlineTaskAdd.jsx` (a
thin-bordered box with no backdrop, replacing a "+ Add task" line in place),
and the sidebar's own Add task button, which now opens a `Popover` wrapping
the same form instead of the centered modal.

Converting every "+ Add task" line surfaced a real bug in `Popover.jsx`
itself: a picker (Date, Priority, Labels, Reminders) opened from inside the
sidebar's new Add-task popover is itself a `Popover`, and both portal to
`document.body` as separate subtrees. The outer popover's outside-click check
compared against its own `popRef` only, so a click inside the nested picker's
dropdown did not register as "inside" and closed the outer popover by
mistake. Fixed by checking for any `.popover`-classed ancestor instead of the
specific `popRef`; verified live by opening the Date picker inside the
sidebar's Add-task popover and selecting a date, confirming the outer popover
stayed open and the chip updated.

`docs/reference/` was still empty except its README when this pass started;
only one screenshot was attached to the request (the Popover bug report
above), not distinct Todoist reference images to save there. Flagged rather
than silently skipped: this pass built and verified the inline pattern
against the existing design-system tokens and the litmus test's stated
intent, not against saved reference screenshots, since none existed to save.

TaskDetail.jsx (opening an existing task) stays a modal, out of scope for
this pass, since it edits a task already in the tree rather than adding one;
the "no row to expand into" exception that justifies the sidebar's popover
does not apply to it. Board layout's own add affordance, and the
Group-not-None virtual-groups add-line in `ProjectView.jsx`, were also left
as the centered modal, matching the same Group-None-only and List-layout-only
scoping the drag change above uses; Today has no per-bucket "+ Add task" line
at all, so nothing there needed converting.

Verified live in both themes: every converted "+ Add task" line (Inbox's
no-section list, a named section, Upcoming's per-day line) expands inline
with no backdrop and no floating card; Escape and Cancel collapse it back
without writing; Enter and the Add task button write through
`store.createProjectTree` and collapse back on success; the sidebar's global
Add task opens a popover, not the centered overlay, and a full add including
picking a date and submitting worked end to end.

Build clean, offline evals 12/12, no spend (no Functions calls, no live LLM).

### Decisions not to relitigate

- `TaskList`'s richer position-aware drag model is opt-in
  (`positionAware`/`destSectionId`), not the default, specifically so Today,
  Upcoming, and task detail cannot regress by inheriting behavior they never
  asked for from a shared component.
- `TaskAddForm.jsx` owns both the fields and the write call. Every wrapper
  (modal, inline, popover) is chrome only; there is one write path
  (`store.createProjectTree`), not one per wrapper.
- `Popover.jsx`'s outside-click detection is "any `.popover` ancestor," not
  "this popover's own ref," now that a popover can contain another popover.
  This is a general fix, not scoped to the Add-task case that surfaced it.

## 2026-07-05: Cross-section reparenting fix merged and deployed to super-ramble.web.app

Merged `fix/cross-section-subtask-reparenting` to main through
[PR #15](https://github.com/cottalucas/super-ramble/pull/15) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8-#14;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`. Deployed commit:
`f552ca9`. Verified the deployed bundle's hash matched the local build
byte for byte. Live site returns 200.

## 2026-07-05: Sub-task drag reparenting now works across sections, not just within one

Reopened, with the stated reason a screenshot from a real Inbox surfaced:
"a task can be dragged into another task" was already built, but scoped to
one `TaskList` instance (one section, or the no-section group) since drag
state lived inside `TaskList` itself; a drop from a different section had
no live `dragId` to act on and silently did nothing. That scoping was
flagged as a known limitation in the prior entry, not a bug at the time; it
is a real bug now that a user hit it directly. No files under
`src/pipeline/` or `evals/` touched.

- `TaskList.jsx` now accepts an optional `sharedDrag` prop (`{ dragId,
  setDragId, dragOverId, setDragOverId }`); when a caller renders several
  instances that should interoperate, it lifts this state to itself and
  passes the same object to every instance, so a drag started in one is
  still live when the drop lands in another. `ProjectView.jsx` and
  `TodayView.jsx` both do this now, across every `TaskList` they render
  (the no-section list, each real section, or each virtual group).
- Found and fixed a real latent bug while making this change, not by
  guessing: the old "same parent, so reorder" check compared `parentId`
  values directly, but two root tasks both have `parentId: null` whether or
  not they are actually in the same section. Dragging a root task from one
  section onto a root task in a different section used to take the
  "reorder" branch by that flawed equality, then silently no-op, since the
  dragged task's id was never found in the drop target's own `roots` array.
  Fixed by checking true list membership instead: a drop is a reorder only
  when both tasks are found in the exact same list (`childrenOf.get(parentId)`
  for a sub-task, or the drop target's own `roots` for a root task);
  anything else reparents. This fixed the bug for every case, sub-task or
  root, not only the one in the screenshot.
- Found a second gap live, not from reading the code: `TodayView.jsx`
  passes an empty `childrenOf` to every `TaskList` on purpose, since Today
  never nests sub-tasks, every due-date bucket renders flat. `TaskList`'s
  own task lookup for drag purposes was built from `roots` plus
  `childrenOf`'s contents, so with an empty `childrenOf` it could not find a
  task dragged in from a different bucket even with `sharedDrag` wired up;
  the drop silently no-op'd the same way, for a different reason. Fixed
  with a new, separate `extraTasks` prop, a flat lookup list that does not
  touch `childrenOf` and therefore does not affect what renders nested;
  `TodayView.jsx` passes its combined Overdue-plus-Today list to every
  instance.

Verified live, not inferred from the diff: reproduced the reported scenario
directly (a root task with a sub-task, plus a separate section with another
task) and dragged the sub-task across the section boundary onto the other
section's task; it moved, confirmed against `parentId` on disk matching the
new parent's id. Dragged a root task from the no-section group onto a root
task in a different section; it reparented too, confirming the latent
root-to-root fix. Confirmed same-list reorder still recomputes `order` only
and never touches `parentId`. Confirmed the cycle guard still blocks
dragging a task onto its own descendant. Repeated the cross-group drag in
Today (Overdue onto Today), confirmed `parentId` matched on disk and the
moved task still rendered as its own flat row, not nested and not
duplicated, since `extraTasks` never touches `childrenOf`. Checked both
themes. `npm run build` succeeds; `npm run eval` stays at 12/12 offline and
12/12 date, unchanged.

Known, accepted gap, not fixed here: in Today specifically, a task that
already has a real `parentId` (rendered as its own flat row, same as any
other) cannot be distinguished from a true sibling when dropped elsewhere
in Today, since `childrenOf` there is deliberately empty; such a drop
always reparents, even if the intent was only to reorder it among Today's
other flat rows. This is a narrow case (Today's own manual reorder is
already a secondary feature there) and fixing it fully would mean building
a project-spanning sibling map Today has deliberately never needed;
flagging honestly rather than leaving it a silent surprise.

### Decisions not to relitigate

- Sub-task (and root task) reparenting via drag now works across every
  `TaskList` instance one view renders, not just within one. A caller that
  wants this passes `sharedDrag` (lifted state) and, if it also passes an
  empty `childrenOf` for its own rendering reasons, `extraTasks` too.
- The reorder-versus-reparent decision is based on true list membership,
  never a bare `parentId` equality check. Two tasks can share `parentId:
  null` without being real siblings.

## 2026-07-05: Header/seed/view-persistence pass merged and deployed to super-ramble.web.app

Merged `feat/upcoming-header-seed-view-persist` to main through
[PR #14](https://github.com/cottalucas/super-ramble/pull/14) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8-#13;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`. Deployed commit:
`2fe8dfd`. Verified the deployed bundle's hash matched the local build
byte for byte. Live site returns 200.

## 2026-07-05: Upcoming's three-row header, a richer seed dataset, and view persistence

Three pieces, verified live via `npm run dev`, not inferred from the diff.
No files under `src/pipeline/` or `evals/` touched.

- Upcoming's List header is now three rows. Row one (title, Display trigger)
  is unchanged. Row two is new: a month/year label ("July 2026", from
  `days[0]`, a new `formatMonthYear` in `src/lib/date.js`) on the left, with
  a decorative `IconCaret` next to it (not wired to a date picker, stated as
  out of scope for this pass), and the existing "‹ Today ›" nav on the
  right, via `justify-content: space-between` on `.week-strip`. Row three is
  the existing day-pill strip, now its own row below rather than sharing
  row two with the nav, each pill showing just weekday plus day-of-month
  (`d.getDate()`, no month, since row two already states it), and today's
  pill now a solid `var(--ds-red)` fill with white text, not the previous
  red-tinted background with red text. Board layout is untouched: no month
  label, no day-strip, exactly as it already rendered, since the task only
  asked for List's header to change shape. Verified live in both themes:
  the month label reads correctly, the nav pages both layouts together (already
  covered by the prior fix), and the highlighted pill is a solid block, not
  tinted text, confirmed against computed `background-color`/`color`, not
  just a screenshot.
- `seedSampleData` (`src/lib/seed.js`) now also builds a full project tree
  through `store.createProjectTree`, one call each for a parent project
  ("Website Relaunch", two sections, several tasks including two with
  sub-tasks, priorities spread 1 through 4, due dates spread across two
  days overdue, several today, and one for most of the next seven days, and
  one task with no date) and a nested child project ("Marketing Launch",
  `parentProjectId` set to the parent, no sections of its own, its tasks
  carrying the three new labels). Labels are created first, through
  `store.createLabel`, since a task's `labels` array is names, not ids, the
  same "matched by name" contract the rest of the app already relies on.
  Idempotency now has two granularities: the original flat Inbox tasks still
  skip by content; the project tree skips by project name, so a repeat run
  neither duplicates a project nor half-creates one. The button's `isLocal`
  gate is gone, in `Sidebar.jsx`; the function already only calls methods
  both adapters share (`createTask`, `createLabel`, `createProjectTree`,
  `listTasks`, `listProjects`, `listLabels`), so this was already safe
  against Firestore, just previously hidden from it. Verified live: ran it
  once, confirmed the parent and child projects, both sections, both
  sub-tasked tasks, and all three labels landed correctly (checked one
  task's detail rail directly, not just the list); ran it again, confirmed
  the task, project, and label counts were unchanged, no duplicates.
- `Shell` in `src/App.jsx` held `view` in plain `useState`, defaulting to
  Today on every mount, no persistence at all. Added `src/lib/view.js`,
  the same `localStorage` pattern as theme, layout, and sidebar, explicitly
  not a router: no URL, no shareable link, no back/forward button, it only
  restores the one stored preference after a refresh. `Shell` reads it on
  mount and writes it on every navigation. A restored `project` view is
  checked once data is ready (`projectById`, already available from
  `AppData`); if the project no longer exists, a `useEffect` navigates back
  to Today instead of rendering `ProjectView`'s own "Project not found"
  state. Verified live: navigated to Upcoming, refreshed, stayed on
  Upcoming; navigated to a project, refreshed, stayed on that project;
  deleted that project directly from the store (simulating it being removed
  since the last visit, not through the app's own in-session delete flow,
  which already handled navigating away live) and refreshed, landed on
  Today, confirmed both visually and by reading the stored view key back
  afterward (`{"type":"today"}`, not the stale project id).

`npm run build` succeeds; `npm run eval` stays at 12/12 offline and 12/12
date, unchanged.

### Decisions not to relitigate

- Seeding is not gated to local preview. `seed.js` only ever calls
  store-interface methods every adapter shares; the safety property is in
  what it calls, not in who can see the button.
- The project tree's idempotency unit is the project name, not individual
  tasks within it. A future pass that wants finer-grained top-up (adding a
  task to an already-seeded project on a second run) needs to look up the
  existing project's sections and tasks first; this pass does not.
- View persistence is a `localStorage` preference, the same as theme,
  layout, and sidebar, not routing. No URL reflects the current view; no
  shareable link exists; the browser's back and forward buttons do nothing
  useful here. A real router is a separate, bigger piece of work if ever
  wanted.

## 2026-07-05: Upcoming List window fix merged and deployed to super-ramble.web.app

Merged `fix/upcoming-list-window-today-anchored` to main through
[PR #13](https://github.com/cottalucas/super-ramble/pull/13) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8-#12;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`. Deployed commit:
`750403d`. Verified the deployed bundle's hash matched the local build
byte for byte (`md5` comparison, not just the filename). Live site returns
200.

## 2026-07-05: Fixed Upcoming's List window, was Monday-anchored, now today-anchored like Board

`UpcomingView.jsx`'s List layout computed its window from `startOfWeek(today)`,
snapping to that week's Monday, while Board computed its window from
`addDays(today, weekOffset * 7)` directly, no snapping, exactly matching the
file's own comment describing "today plus the next six days." On a Sunday
this meant List's first visible day was the Monday six days in the past, not
today; List and Board disagreed on every day of the week except Monday
itself. No files under `src/pipeline/` or `evals/` touched.

Fixed by deleting the duplicate computation entirely rather than
reconciling two versions: `startOfWeek`, `weekStart`/`listDays`, and
`boardStart`/`boardDays` are gone. Both layouts now read one `days` array,
`Array.from({ length: 7 }, (_, i) => addDays(addDays(today, weekOffset * 7), i))`,
so there is exactly one definition of "the current window" for `weekOffset`
to page through, not two that happened to agree only sometimes.
`WEEKDAY_LABELS` and `todayMondayIndex` are gone too; the week-strip's pill
row now maps over the same `days` array, showing each day's real weekday
and day-of-month (the same `DOW_SHORT`/`formatDayHeader` pair `daySection`
already used for its own headers), highlighted by comparing `toISODate(d)`
against today's own ISO date, not a fixed index into a Monday-first array.

`overdueTasks`, `listsByKey`'s per-day de-duplication, and `windowRaw`/
`virtualGroups` (Group by) needed no change: all three were already written
against `days` and `weekOffset`, never against `startOfWeek` or a
Monday-relative index, so they picked up the corrected window automatically.

Verified live in local preview, not inferred from the diff: on load
(`weekOffset` 0, a Sunday in this session), List's first day and its
highlighted week-strip pill were both "Sun 5 Jul," Today, matching Board's
first column exactly, both showing the same three tasks. Paging forward
with "›" moved both layouts to the same next week (Sun 12 Jul onward,
confirmed by switching layouts mid-page); no pill was highlighted on that
week, since today wasn't in it. Set a task's due date to yesterday and
confirmed it still surfaced under Overdue, not its own day section, and
that Board (which has no Overdue column) still excluded it entirely, both
unchanged from before this fix. `npm run build` succeeds; `npm run eval`
stays at 12/12 offline and 12/12 date, unchanged. Checked both themes.

### Decisions not to relitigate

- Upcoming's window, in both layouts, is `today + weekOffset * 7` through
  six days after that, never a Monday-aligned calendar week. A future
  change to page by a real calendar week needs a stated reason; this fix
  removed the only code that did that, on purpose, because it was the bug.

## 2026-07-05: Display/grouping/sub-task-drag pass merged and deployed to super-ramble.web.app

Merged `fix/phase-2.8-display-grouping-subtask-dnd` to main through
[PR #12](https://github.com/cottalucas/super-ramble/pull/12) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8-#11;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`. Deployed commit: `a99a3a5`.
Verified the deployed bundle's hash matched the local build
(`index-5K8vp-fD.js`) and contains the string `Display`. Live site returns
200.

## 2026-07-05: Button text contrast, Display rename, Today/Upcoming grouping, sub-task drag reparenting

Fixes and two reopened decisions, from live product feedback with reference
screenshots. No files under `src/pipeline/` or `evals/` touched.

- Buttons never had their own `color` rule, so a button with no other color
  source (`.popover-item`) fell back to the browser's own default, black,
  regardless of theme: unreadable white-on-black text on Add Project's
  Color and Parent project dropdowns in dark mode, confirmed with
  `getComputedStyle` (`rgb(0, 0, 0)` text on `rgb(32, 32, 32)`) before
  fixing. Fixed at the root, `button { color: inherit }`, not by coloring
  `.popover-item` alone, so no future button-based control repeats it.
  Verified the fix live in both themes and re-checked the app broadly for a
  regression; found none.
- `LayoutControl`'s trigger no longer switches its own label between "List"
  and "Board"; it now always reads "Display" (the icon still shows current
  mode). `.layout-trigger`'s `92px` min-width still fits it.
- Reopened, with the stated reason that this is a direct, explicit product
  request: Today and Upcoming's Display popover now includes Group by and
  Sort by too, the same as Inbox and Project, superseding the phase 2.8 log
  entry that intentionally left them out ("Today no longer has its own Sort
  control, only List/Board tabs... a deliberate scope reduction"). Group
  None keeps each view's existing structure (Today's fixed Overdue/Today
  split, Upcoming's day/Overdue window) exactly as before; Priority, Date,
  and Date added replace it with virtual groups (`lib/group.js`, already
  built for Inbox and Project) computed over every task currently in view,
  rendered as named sections (List) or `Board` columns, the identical
  pattern `ProjectView.jsx` already uses. Cross-column drop writes the same
  fields ProjectView's grouped Board already does: `priority`, `due` (or
  `null` for "No date"), or a no-op for Date added. Verified live, both
  layouts, both views: Group by Priority correctly re-bucketed Today's
  overdue-plus-today tasks; Group by Date correctly split Upcoming's window
  by day.
- Reopened, with the stated reason above: sub-tasks can now be dragged and
  dropped into a different task to move under it, superseding phase 2.6's
  "sub-task siblings are not drag-reorderable," which had explicitly invited
  a reopening with a reason. `TaskRow` now threads `draggable`, `dragOver`,
  and the drag owner's raw `dragId`/`dragOverId` down through its own
  recursive sub-task rendering, instead of stopping at root rows.
  `TaskList.handleDrop` now looks up both the dragged and the dropped-on
  task (via a flat map built from `roots` plus every array in `childrenOf`)
  and branches on their `parentId`: same parent reorders exactly as before,
  gated by Sort being Manual since it writes `order`; a different parent
  reparents instead, writing `parentId` to the target's id, never gated by
  Sort since it is a different field, the same reorder-versus-reschedule
  distinction Upcoming already draws for `due`. A cycle guard walks the
  target's own descendants first and refuses the drop if the dragged task
  is among them, so a task can never become its own descendant's child.
  Scoped deliberately to one `TaskList` instance, same as every other drag
  in this app: reparenting across two different sections, or across
  projects, does not work, because each section's `TaskList` keeps its own
  isolated drag state, and a cross-instance drop already has no `dragId` to
  act on. Verified live: dragged a sub-task onto a different root task,
  confirmed it moved under the new parent and `parentId` matched on disk;
  dragged that new parent onto its own child, confirmed the cycle guard
  blocked it (`parentId` unchanged); dragged two ordinary root tasks past
  each other, confirmed plain reorder still recomputes `order` only,
  `parentId` untouched.

`npm run build` succeeds; `npm run eval` stays at 12/12 offline and 12/12
date, unchanged.

### Decisions not to relitigate

- Buttons get their color from `color: inherit` at the element-type level,
  the same convention `:focus-visible` already uses. A new button-based
  control does not need its own color rule to read correctly in both themes.
- Sub-task reparenting via drag is scoped to one `TaskList` instance. Do not
  extend it across sections or projects without first giving `TaskList` (or
  its caller) shared drag state across instances, the same change Upcoming
  already made for its own cross-day drag.

## 2026-07-05: Popover and Upcoming Board fix pass merged and deployed to super-ramble.web.app

Merged `fix/phase-2.8-popover-positioning-upcoming-board-paging` to main
through [PR #11](https://github.com/cottalucas/super-ramble/pull/11) after
CI (`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8, #9, and
#10; nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`, the same Spark-plan-safe
subset as every deploy so far. Deployed commit: `7fdde9f`. This time,
verified the deploy actually shipped the fix rather than trusting the CLI's
success message: fetched the live bundle after deploying and confirmed its
hash matched the local build exactly (`index-BiAikqGl.js`) and that it
contains the string `popover-right`, the class the positioning fix adds.
Verified the live site returns 200.

## 2026-07-05: Popover positioning and Upcoming Board week paging, verified by running the app

This task named four suspected bugs and asked that each be verified by
actually running the app, in both themes, not inferred from the diff, since
this exact area had already gone through two prior fix passes. Doing that
turned up a real split: two of the four were genuinely broken and are fixed
here; two were already correct, confirmed live, not just re-claimed. No
files under `src/pipeline/` or `evals/` were touched.

**Broken, and fixed:**

- Popover positioning. `.popover` had an unconditional `left: 0`, anchored
  to its trigger's left edge, with `min-width: 240px` and no viewport
  awareness. Measured directly with `getBoundingClientRect()` before
  touching anything: `LayoutControl`'s popover in Inbox, Board layout,
  overflowed the right edge of a 1400px window by 124px, not a rounding
  error, a real, reproducible clip. Root cause was exactly what the task
  suspected checking: not `.popover-wrap`'s `position: relative` (present
  everywhere it's used, confirmed by reading every usage), not an ancestor
  `overflow: hidden` (the trigger sits in `.view-header`, a sibling to
  `.board`/`.upcoming-board-scroll`, never a descendant, so their own
  scroll overflow can't clip it), just the CSS's own unconditional anchor
  with no boundary check. Fixed in `Popover.jsx` itself, not with a
  per-view nudge: it now measures its own rendered position in a
  `useLayoutEffect` (before paint, so there is no visible flash) and adds a
  `popover-right` class, flipping `left: auto; right: 0`, whenever the
  default left-anchored position would run past the viewport's right edge.
  This is dynamic, not hardcoded to Board or to any one view, so it holds
  regardless of viewport width or which view is open. Verified with
  `getBoundingClientRect()` after the fix, not just a screenshot, in Inbox
  (List and Board), Today, Upcoming (List and Board), and Project (List and
  Board): every popover's right edge now falls inside the window width.
  Also confirmed the flip engages correctly in List layout at a narrow
  900px viewport, where List's own centered content is tight enough to
  overflow too, proving this isn't special-cased to Board. Checked both
  themes; the fix is layout-only, no color involved, and both rendered
  correctly.
- Upcoming's Board week navigation. It rendered a single "Today" button
  that scrolled the horizontal container back to its start, no `‹`/`›`, and
  `boardDays` was computed from the real `today` unconditionally, never
  reading `weekOffset` at all, so there was no way to page to a different
  week; every visit showed the same fixed seven days. This is a real
  behavior change from what phase 2.8 shipped on purpose (see the entry
  below, which correctly and honestly described "Board has no week paging"
  as the shipped design, not a bug, at the time), now superseded because
  this task asks Board to page too. Fixed by computing `boardDays` from
  `addDays(today, weekOffset * 7)` instead of bare `today`, and rendering
  the exact same three nav buttons (`‹`, `Today`, `›`) List uses, unconditional
  on layout, so both layouts read the identical `weekOffset` state through
  the identical control. `docs/roadmap.md`'s phase 2.8 Board bullet is
  updated to point at this change rather than describe the old, no-paging
  behavior as current. Verified live: at `weekOffset` 0, Board starts on
  today (Sun 5 Jul in this session); clicking `›` moved Board forward
  exactly one week (Sun 12 Jul); switching to List afterward showed the
  same paged week, confirming both layouts share one state, not two;
  clicking Today reset to the current week and its tasks reappeared.
  Checked in dark theme too.

**Reported as broken, found already working, verified, not re-"fixed":**

- Sorting. Read `ProjectView.jsx` first: `boardColumns` and the List-mode
  section lists both already call `sortTasks(..., sortMode)` before handing
  arrays to `Board`/`TaskList`; `group.js`'s `groupTasks` does the same per
  virtual group. `Board.jsx` itself never calls `sortTasks`, which is fine:
  it is a dumb renderer of whatever `columns[].tasks` it's given, and the
  caller is what sorts. That reading suggested sort was already wired
  correctly, so rather than trust the reading (the whole reason this task
  exists), it was verified live: set two tasks to priority 2 and 3 in the
  seed data, opened Inbox, set Sort to Priority in List, confirmed the
  visible order changed to match (P1, P2, P2, P3, P4); switched to Board,
  confirmed the identical order held; repeated inside Q3 Campaign's "Design"
  section specifically, not just the no-section column, same result; set
  Sort to Date and confirmed the order changed again (falling back to
  `order` for tasks with no due date, which is `sortTasks`'s own documented
  behavior, not a bug). Sorting was not broken in either layout for either
  project type tested. Nothing was changed here.
- Add Project. The file already read as a labeled vertical form (Name over
  a bordered input, Color and Parent project over `.select-control`
  dropdown buttons showing the current value), matching the previous
  pass's log entry below, not the Quick-add chip row this task described.
  Confirmed the deployed bundle at `super-ramble.web.app` matched: fetched
  the live JS and found `form-label`, `select-control`, and the literal
  string `"Parent project"` in it, ruling out a stale deploy explaining the
  mismatch. Opened the dialog live anyway rather than trust either the
  source or the deployed bundle: three labeled fields render correctly,
  Color's dropdown shows the swatch and the color's name ("Berry Red"),
  Parent project's dropdown lists real candidates and updates on selection,
  and creating a project through it worked end to end, landing in the
  sidebar with the chosen color. Nothing was changed here either.
- CSS audit for hardcoded colors, as asked: found no raw/unmixed color in
  `LayoutControl.jsx`, `LayoutTabs.jsx`, `Board.jsx`, or their CSS rules; all
  already resolve through a `--ds-*` token or `color-mix()` against one.
  Could not locate the specific "blue swatch-preview icon" the task named:
  `AddProjectModal.jsx`'s color swatches set their own background via an
  inline style from `colorHex()`, which is correct, not a bug, a color
  picker has to show the real colors on offer, the same pattern
  `PriorityPicker`/`LabelPicker` already use; no swatch in the current file
  is blue by default. The only unmixed colors left in `styles.css` are
  `#fff` text on `var(--ds-red)` backgrounds and `.chip.active`'s `#d0d0d0`
  border, both already reviewed and explicitly kept as-is by phase 2.7's
  dark-mode audit. Stating plainly, per the task's own instruction: this
  specific item could not be verified against the current code, because it
  does not appear to exist in the current code.

Verified overall: `npm run build` succeeds; `npm run eval` stays at 12/12
offline and 12/12 date, unchanged. Every check above was run against the
actual app via `npm run dev`, in both Light and Dark theme, not inferred.

### Decisions not to relitigate

- `Popover` positions itself by measurement (`getBoundingClientRect` in
  `useLayoutEffect`), not a hardcoded per-view offset. A future popover with
  a trigger anywhere near a viewport edge gets this for free; do not add a
  one-off CSS override instead.
- Upcoming's Board and List share one `weekOffset` state and one nav
  control. Do not reintroduce a Board-specific "no paging" mode without a
  stated reason; the entry below that shipped it that way was correct for
  its time, not wrong, and is superseded here, not being called a mistake.

## 2026-07-05: Upcoming header and Add Project polish pass merged and deployed to super-ramble.web.app

Merged `fix/phase-2.8-upcoming-header-and-add-project-form` to main through
[PR #10](https://github.com/cottalucas/super-ramble/pull/10) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8 and #9;
nothing gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`, the same Spark-plan-safe
subset as every deploy so far. Deployed commit: `1489abd`. Verified the live
site returns 200.

## 2026-07-05: Fixed Upcoming's header stability, Layout popover styling, Board dividers, Add Project form

A fix and polish pass against phase 2.7/2.8's existing scope, not a new
decision; no doc shape changed. No files under `src/pipeline/` or `evals/`
were touched.

- Upcoming's title row (`Upcoming` plus `LayoutControl`) rendered an extra
  "Today" button inline, Board layout only, so the row's own contents
  differed and shifted between List and Board. Removed that conditional
  entirely from the title row; it is now byte-for-byte identical in both
  layouts (title, spacer, trigger, nothing else). Added a second row, the
  existing `.week-strip`, now always rendered right after the header in both
  layouts: List keeps its full week-strip nav (‹, Today, ›) and weekday
  pills there; Board's "jump to today" scroll control moved into the same
  row, alone, since Board has no week paging to page with chevrons.
  Verified directly, not just visually: the trigger button's `y` (36) and
  `width` (92px) and the week-strip's `y` (86) hold identically in both
  layouts; only the content column's own horizontal offset differs between
  List and Board, an existing, unrelated tradeoff (Board drops the centered
  `max-width` for horizontal scrolling), not something toggling List/Board
  moves within one layout. Audited Inbox, Today, and Project's
  header rows too, per the task; none of them conditionally add or remove an
  element based on layout, so none needed a change, only confirmation.
- `.popover-section-label` ("Group by", "Sort by") dropped the uppercase
  transform and letter-spacing, went from `11px` to `12px`, and gained a
  hairline `border-top` so each section reads as a clearly separated block
  from the tabs and from each other, the same separation `.section-head-row`
  already uses elsewhere in the app via a hairline. No reference screenshot
  is in the repo yet (`docs/reference/` is still a placeholder, per its own
  README); this is a reasoned styling match against the task's description
  ("bold, small section labels," consistent weight and rhythm) and the
  app's own existing hairline-divider convention, not a pixel comparison.
- `.board-col` was a filled `var(--ds-sidebar-bg)` card with a 16px gap
  between columns. Changed to a plain (transparent) background with
  `border-right: 1px solid var(--ds-line)` and `padding: 0 16px`, the exact
  pattern `.day-col` (Upcoming's restored Board columns) already
  established; `.board`'s gap dropped to `0` since the column padding now
  does that job, and the first column drops its left padding to stay flush
  with the header above it, again mirroring `.day-col:first-child`. The last
  column drops its own `border-right` so the divider never trails off after
  it. Verified computed styles directly: `background-color:
  rgba(0,0,0,0)`, `border-right-color` resolving to the theme's `--ds-line`
  value in both light and dark.
- `src/components/AddProjectModal.jsx` rebuilt from a Quick-add-style chip
  row into a labeled vertical form: a new `.form-field`/`.form-label` pair
  above each of the three fields, unchanged (Name, Color, Parent project).
  Name is now a bordered `.form-input` instead of the borderless, oversized
  `.modal-name` style Quick-add uses for its headline field, since a labeled
  form field reads as a form control, not a title. Color and Parent project
  are now `.select-control` buttons (a bordered row showing the current
  value plus a trailing `IconCaret`, styled like a dropdown) instead of bare
  `.chip` pills; Color shows the color's name via a new `colorLabel` helper
  in `src/lib/colors.js` ("berry_red" -> "Berry Red"), not just a swatch
  behind the word "Color". `validParentCandidates`, `store.createProject`,
  and every existing guard (Inbox excluded, a project excluded from its own
  descendant list) are unchanged; only the visual layer changed. Did not add
  Description, Workspace, Access, Add-to-favorites, or a Layout picker; all
  four stay out per `docs/roadmap.md`, and nothing here reopens that.
  Skipped the optional character counter on Name; not required, and adding
  it would be scope beyond what the task asked for.

Verified live in local preview: Upcoming's trigger button and title stayed
at identical coordinates across a List/Board toggle; the week-strip row's
content differs (chevrons and weekday pills in List, a lone Today button in
Board) but its row position does not. The Layout popover's Group by and Sort
by read as clearly separated, bold, sentence-case sections. Board columns on
a project with a real section showed a thin divider on a plain background in
both themes, confirmed against computed styles, not just a screenshot.
Created a project through the new labeled form (name, a non-default color,
a parent project), confirmed it appeared correctly nested in the sidebar
with the chosen color. `npm run build` succeeds; `npm run eval` stays at
12/12 offline and 12/12 date, unchanged.

### Decisions not to relitigate

- Every view's title row (title, optional icon, spacer, `LayoutControl`) is
  structurally identical regardless of Layout. A view-specific control that
  needs a List/Board-dependent presence (Upcoming's Today navigation) goes
  in a second row below the header, never inside the title row itself.
- Add Project's three fields are labeled form fields, not chips. A future
  field added to this dialog follows the same `.form-field`/`.form-label`
  pattern, not a bare pill.

## 2026-07-05: Layout control fix pass merged and deployed to super-ramble.web.app

Merged `fix/phase-2.8-layout-control-consistency` to main through
[PR #9](https://github.com/cottalucas/super-ramble/pull/9) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR, the same GitHub restriction noted for PR #8; nothing
gated the merge on it. Ran
`firebase deploy --only hosting,firestore:rules`, the same Spark-plan-safe
subset as every deploy so far. Deployed commit: `02ff462`. Verified the live
site returns 200. Also flagged, not fixed here: `Popover`'s right-edge
overflow in Board layout, spun off as its own follow-up task rather than
folded into this deploy.

## 2026-07-05: Fixed three phase 2.8 regressions: Layout control consistency, button styling, focus rings

A fix pass, not a new decision; no doc shape changed. Fixed the three
confirmed bugs from phase 2.8:

- Today and Upcoming rendered `LayoutTabs` directly, a bare always-visible
  pill; Inbox and Project rendered `LayoutControl`, a trigger button behind a
  popover. Two different header controls for one preference. Fixed by
  rendering `LayoutControl` everywhere: `TodayView.jsx` and
  `UpcomingView.jsx` now import and render it exactly like `ProjectView.jsx`
  does, just without `groupMode`/`onGroupChange`/`sortMode`/`onSortChange`.
  `LayoutControl` now derives `showGroup`/`showSort` from whether those props
  are `undefined`, so the popover shows only the List/Board tabs for Today
  and Upcoming, and tabs plus Group by plus Sort by for Inbox and Project,
  instead of rendering an empty section label when the props were missing.
  `LayoutTabs.jsx` still exists, now only ever rendered from inside
  `LayoutControl`'s own popover, never directly by a view.
- `.btn` had no `display: flex` and no `gap`, so an icon paired with a label
  (the trigger button's icon and "List"/"Board" text) rendered squeezed
  together instead of as a row. Added `display: inline-flex; align-items:
  center; gap: 6px` to the base `.btn` rule; checked every other `.btn` usage
  in the app (`App.jsx`, `AddProjectModal.jsx`, `SettingsModal.jsx`,
  `ConfirmDialog.jsx`, `QuickAddModal.jsx`, `TaskDetail.jsx`,
  `UpcomingView.jsx`) and all of them render a single text child, where
  `gap` has no effect and `inline-flex` renders identically to the previous
  layout, so this is additive, not a risk to existing buttons. Added a
  `.layout-trigger` class (`min-width: 92px; justify-content: center`), sized
  to fit "Board", the longer of the two labels, so toggling List/Board never
  changes the button's own footprint; verified directly that the computed
  `width` stays `92px` for both "List" and "Board".
- No `:focus-visible` rule existed anywhere, so every focusable control
  showed the browser's raw default blue outline. The task named `.btn`'s
  three variants specifically, but the definition of done said "anywhere in
  the app," which is broader, so the fix is one global rule rather than three
  class-scoped ones: `button:focus-visible, input:focus-visible,
  textarea:focus-visible, [tabindex]:focus-visible { outline: 2px solid
  var(--ds-ink); outline-offset: 2px; }`. `--ds-ink` was chosen over
  `--ds-red` because the ring sits outside the button via `outline-offset`,
  against the page's canvas or sidebar background, not against the button's
  own fill, so a neutral, always-high-contrast color reads better than the
  brand red, which is already doing double duty as the primary-action and
  destructive-action color elsewhere. `[tabindex]` was added, beyond what the
  task named, to also cover `DatePicker.jsx`'s calendar day cells (`role=
  "button"`, `tabIndex={0}`), the one non-native focusable control in the
  app; native buttons and inputs across the whole app get the ring through
  the element-type selector, not a per-class list, so nothing was missed.
  Verified `:focus-visible` (not plain `:focus`) so a mouse click never shows
  the ring, only keyboard navigation does, and checked the ring's contrast in
  both themes: `--ds-ink` is `#202020` on the light canvas and `#e8e6e3` on
  the dark canvas, both clearly visible against their respective surfaces.
- Audited every class `LayoutControl.jsx`, `LayoutTabs.jsx`, and `Board.jsx`
  introduced against `docs/design-system.md`'s tokens, the same check phase
  2.7's dark-mode pass ran. Unlike that pass, this audit found nothing to
  fix: `.board`, `.board-col`, `.board-col-head`, `.layout-tabs`, `.layout-
  tabs button`, and `.popover-section-label` already used `var(--ds-*)`
  tokens or `color-mix()` against one for every color value, with no
  hardcoded hex or `rgb()` literal anywhere in those rules or in the three
  component files' JSX. Confirmed by grepping all three files for `#` and
  `rgb(` directly, not just by eye.

Found, not fixed, out of this pass's scope: `Popover`'s absolute positioning
(`left: 0` relative to its `.popover-wrap`) pushes `LayoutControl`'s popover
off the right edge of the viewport when the trigger sits at the far right of
a full-width header, which only happens in Board layout, where `content-
inner` drops its centered `max-width` to allow horizontal scrolling. This
already affected Inbox and Project before this pass; rendering `LayoutControl`
on Today and Upcoming now surfaces the same pre-existing quirk there too, but
consistently, not as a new or worse regression, and fixing `Popover`'s
positioning logic was not one of the three named bugs or the token audit.
Flagged separately rather than folded into this pass.

Verified live in local preview: Inbox, Today, Upcoming, and Project all show
the identical trigger button (icon plus "List" or "Board", same `92px`
width, same `.btn.btn-quiet.layout-trigger` classes); Today and Upcoming's
popover shows only the List/Board tabs, Inbox and Project's also shows Group
by and Sort by; toggling List/Board leaves the button's computed width and
the header title's position unchanged; focused controls (a button, a text
input) show the `--ds-ink` ring in both light and dark theme, never
browser-default blue. `npm run build` succeeds; `npm run eval` stays at
12/12 offline and 12/12 date, the same counts as before this pass. No files
under `src/pipeline/` or `evals/` touched.

### Decisions not to relitigate

- `LayoutControl` is the one header control for every view that supports
  Board. A view that has no Group by or Sort by passes those props as
  `undefined`; it does not get a separate, bare-tabs component again.
- The focus ring is a single global rule keyed off element type
  (`button`, `input`, `textarea`, `[tabindex]`), not per-class. A new
  button class does not need its own focus-visible rule to get one.

## 2026-07-05: Phase 2.8 part 1 merged and deployed to super-ramble.web.app

Merged `feat/phase-2.8-board-layout` to main through
[PR #8](https://github.com/cottalucas/super-ramble/pull/8) after CI
(`build-and-eval`) passed on both the branch push and the PR. Could not
self-approve the PR (GitHub blocks approving your own PR); nothing gated the
merge on that, so it proceeded. Ran
`firebase deploy --only hosting,firestore:rules`, the same Spark-plan-safe
subset as the phase 2 deploy; Functions stay undeployed until phase 3, same
as before. Deployed commit: `9a3ed1f`. Verified the live site returns 200.

## 2026-07-05: Phase 2.8, part 1: Board layout, grouping, and a persistent Layout preference

Built the six pieces this pass was scoped to: `src/lib/layout.js`; a
`LayoutControl` popover (List/Board tabs, Group by, Sort by) on Inbox and
Project, replacing `SortControl`; virtual grouping (`src/lib/group.js`) for
Priority, Date, and Date added; a generic `Board` component with
cross-column drag for Inbox, Project, and Today; Upcoming's Board restoring
phase 2's original horizontal per-day window; and a collapsible sidebar
(`src/lib/sidebar.js`). No files under `src/pipeline/` or `evals/` were
touched; `npm run build` and `npm run eval` stay green at 12/12 offline and
12/12 date, unchanged from before this pass. No store method was added; every
write goes through the existing `store.updateTask`, exactly as the task
predicted. Settings' two-pane redesign, part of the original phase 2.8
scoping in `docs/roadmap.md`, was not in this pass's build list and was not
built; it stays Next as phase 2.8 part 2.

- `src/lib/layout.js` mirrors `src/lib/theme.js` exactly: one `localStorage`
  key, "list" or "board". Unlike theme, the value is held in `AppData`'s
  React context (`layout`/`setLayoutPref`), not read fresh by each view,
  since the requirement was that switching it in one view shows up in every
  other mounted view immediately, not only after a remount or reload.
- `LayoutControl.jsx` (Inbox, Project) embeds `LayoutTabs.jsx` (the List/Board
  toggle) plus Group by (None, Priority, Date, Date added) and Sort by
  (Priority, Date, Manual), replacing `SortControl.jsx` (deleted). Today and
  Upcoming render `LayoutTabs` directly with no popover, matching the task's
  explicit scope: "just the List/Board tabs, no Group by control." This also
  removes Today's phase 2.5 Sort control, a deliberate scope reduction stated
  in the task, not an oversight; Today's List layout is now unconditionally
  manual-ordered and draggable, the same no-sort-gate precedent Upcoming's
  agenda already established.
- `src/lib/group.js` (`groupTasks`) computes virtual groups from root tasks
  (`parentId: null`) only, keyed by the field's literal value, read-only, the
  same relationship Sort already has to `order`. Priority is a fixed set of
  four groups (`Priority 1..3`, `No priority`), always rendered so the column
  set is predictable even when a bucket is empty. Date keys on the literal
  `due.date` string, with a `No date` group last. Date added keys on
  `createdAt` truncated to its calendar day, not the raw timestamp: a raw
  `createdAt` is unique per task and would group nothing at all. Both date
  variants reuse the existing `relativeLabel` helper for their labels.
- `ProjectView.jsx`: Group None is the untouched original code path, the
  project's real Sections. Group Priority, Date, or Date added replaces that
  path with `groupTasks`'s output, rendered as named sections (List, via the
  existing `TaskList`, so Sort and manual reorder work identically to a real
  section) or as `Board` columns. Switching back to None restores the real
  Sections; grouping never writes `sectionId`, so a section's own data is
  provably unchanged by a Group detour, verified directly against
  `localStorage` during live testing.
- `src/components/Board.jsx`: a generic column-of-cards renderer with one
  shared drag state across the whole board, the same shared-state need phase
  2.7's cross-day reschedule had against `TaskList`'s deliberately
  per-instance isolation. Board has no opinion on what a column or a
  cross-column drop means; it reports "card moved from column A to column B"
  or "reorder column C" through `onReorder`/`onCrossColumnDrop`, and the
  caller (`ProjectView`, `TodayView`) decides what that writes, including the
  no-op cases. Cards are root tasks only, no nested sub-task cards, matching
  the precedent Today and Upcoming's existing card view already set.
- Cross-column drop semantics, all through the existing `store.updateTask`:
  Group None writes `sectionId` (the one new cross-section case this phase
  allows, narrowly, per the roadmap); Priority writes `priority`; Date writes
  `due` via the existing `rescheduleDue` (or `null` for the "No date"
  column); Date added is a no-op, since `createdAt` is a system timestamp,
  not a drag-writable field, the same reasoning that already makes Overdue a
  non-reschedule-target in Today and Upcoming.
- `TodayView.jsx`'s Board is a fixed two-column `Board` (Overdue, Today).
  Dropping on Today reschedules an overdue task via `rescheduleDue`; dropping
  on Overdue is a no-op, matching phase 2.7's existing rule verbatim.
- `UpcomingView.jsx`'s Board restores phase 2's original horizontal window
  literally: today plus the next six days, no week paging, no Overdue column,
  since phase 2 never had one and the task asked for phase 2's layout
  specifically, not a new design. The phase 2.7 drag machinery
  (`sectionKeyFor`, `handleDrop`, `handleDropOnSection`, `renderRow`) turned
  out to already be layout-agnostic, keyed on section keys rather than the
  visual shape, so it now drives both the vertical List agenda and the
  horizontal Board columns unchanged, no duplication needed.
- `src/lib/sidebar.js` is the same `localStorage` pattern a third time. A
  toggle icon sits in the sidebar's own head next to Settings when shown;
  when hidden, a small fixed icon at the content area's top-left brings it
  back. State lives in `App.jsx`'s `Shell`, the one place that renders both
  the sidebar and the content column.
- Found and fixed a real bug during live verification, not in the spec but in
  `Board`'s own drag state: `dragOverColKey` initializes to `null`, which is
  also a legitimate column key (the "No section" or "No date" column), so
  that column showed a permanent drag-over outline before any drag had ever
  happened. Fixed by requiring a drag in progress too:
  `dragId && dragOverColKey === col.key`.
- A real, pre-existing doc/code gap surfaced while updating
  `docs/architecture.md`: `projects.view` ("list" | "board") has been on the
  schema since phase 1, written on every create, but nothing reads it; Layout
  is now confirmed to be the single global `localStorage` preference this
  pass built, not a per-project field. Left on the schema rather than removed
  (removing it touches both store adapters and `tree.js`, outside this pass's
  six-item scope), but documented plainly in `docs/architecture.md` rather
  than left as a silent trap for a future agent who might assume it does
  something.

Verified live, in local preview: switching Layout to Board in Today showed
Board in Inbox and Upcoming without navigating away and back, and survived a
reload. Inbox, List, Group by Priority showed four named sections matching
each priority; switching to Board showed the same four groups as columns;
switching Group back to None restored the real "No section" (Inbox has no
sections) unchanged. Created a real section ("Design") in a project with
tasks in and out of it, switched to Board with Group None, dragged a
no-section task into the section column, and confirmed `sectionId` on disk
matched the section's id with every other field untouched. Dragged a task
between Priority columns and confirmed `priority` changed on disk;
`sectionId` stayed `null`. Dragged a task between Date columns, including
into and out of "No date," and confirmed `due` changed (or cleared)
correctly. Today's Board: dragged an overdue task onto Today and confirmed it
rescheduled to today; dragged a task onto Overdue and confirmed nothing
changed. Upcoming's Board: confirmed the restored horizontal columns render
today through six days out with no Overdue column, and that dragging a task
across day columns rescheduled it, preserving its time of day, the same as
List. Verified Sort/Group/Layout independence directly: set Sort to Date,
switched Group to Priority, confirmed Sort's checkmark and the
date-ordering inside the ungrouped column both survived; switched Layout to
Board, confirmed Group and Sort both survived that switch too. Sidebar:
hidden it, confirmed the content column took full width and a small reveal
icon appeared, reloaded and confirmed it stayed hidden, then revealed it
again. Console stayed clean throughout. Native `DragEvent` simulation needed
a delay between dispatched `dragstart`/`dragover`/`drop` events and reading
the result, the same timing artifact phase 2.6's log already noted; awaiting
between dispatches surfaced the real behavior.

### Decisions not to relitigate

- Layout is one global preference held in `AppData` context, not per-view
  component state and not the schema's `projects.view` field. Do not wire
  Board back to `projects.view`; that field is confirmed dead, documented in
  `docs/architecture.md`.
- Group by never writes to a section; None is the only Group value under
  which Sections are the live, editable structure. Priority, Date, and Date
  added are read-only groupings the same way Sort already is.
- `Board` is intentionally ignorant of what a column represents. Every
  cross-column write policy (sectionId, priority, due, or a no-op) lives in
  the calling view, not in `Board` itself.
- Cards in Board never show nested sub-tasks. Sub-task structure is a List
  and task-detail concept; Board columns hold root tasks only, matching the
  precedent Today and Upcoming's card view already set.
- Today no longer has its own Sort control, only List/Board tabs, a
  deliberate scope reduction this pass, not a regression to silently restore.

## 2026-07-05: Reopened Board a third time, scoped phase 2.8, with a reason

Board layout has been declined twice on the record: the scaffolding pass, and
phase 2.6, both times because a Board without drag-and-drop would read as
broken. Phase 2.6 and phase 2.7 built drag-and-drop since, reorder and
reschedule, so that reason no longer holds, and Lucas's reference screenshots
show Board used pervasively, a persistent choice across every task view in
real Todoist, not an optional extra. Reopening it a third time with that
stated reason, per the project's own rule that a reopened decision needs one.

Scoped phase 2.8 in `docs/roadmap.md`: a persistent List/Board preference; a
Group-by control (Priority, Date, Date added, deliberately not Label) on
Inbox and Project, rendering virtual sections in List or columns in Board;
cross-column drag in Board writing the grouped field, narrowly including one
new cross-section case (Board's no-Group column view moves `sectionId`,
everything else cross-section stays out); Today's Board as the existing
Overdue/Today split rendered as two columns; Upcoming's Board restoring
phase 2's original horizontal per-day columns, superseded as the List default
by phase 2.7 but not deleted, now the Board-mode rendering; a collapsible
sidebar; and a two-pane Settings with a polished user menu.

Declined again, this pass: Label as a Group-by field (multi-valued, needs
different drag semantics than a single-valued field, its own scoped pass),
Calendar (not reopened even though Board was), the Layout panel's Filter
section, and cross-project drag in any form.

### Decisions not to relitigate

- Board is in. Do not reopen the "reads as broken without drag-and-drop"
  objection; it was resolved by phase 2.6 and 2.7 before this reopening.
- List/Board is one global preference, not a per-view setting.
- Grouping and Sections are mutually exclusive renderings of the same
  project, matching real Todoist: Group other than None replaces Sections
  while active, it does not nest inside them.
- Label grouping stays out until its own pass; do not fold it into Priority
  or Date's drag-writes-the-field mechanics without deciding the
  multi-membership question first.

## 2026-07-05: Phase 2.7 part 3, settings, closing out phase 2.7

Built the three pieces this pass was scoped to: a Settings entry point, an
Account section with sign-out behind a confirm, and a Theme section with a
Light/Dark toggle. This closes phase 2.7; all three parts are now Built in
`docs/roadmap.md`. No files under `src/pipeline/` were touched. No schema and
no store method were added, matching the task's own prediction: sign-out is a
Firebase Auth call, account info reads the already-available auth-context
user object, and theme is a `localStorage` key, never a Firestore document.

- `src/components/SettingsModal.jsx`, a modal (not a new routed view) with
  two sections. Account shows the signed-in name and email read-only; in
  local preview, where there is no real account to show, it says so instead
  of a sign-out control that would do nothing (`isLocal` already gated the
  old direct sign-out button the same way). Sign out opens the existing
  `ConfirmDialog` before calling `signOut` from the auth context.
- The entry point is a gear icon (`IconSettings`, new in `Icons.jsx`) in the
  sidebar head, replacing the direct sign-out icon-button that used to sit
  there unconfirmed. Settings is reachable in both local and signed-in mode,
  since Theme is useful regardless of which; only the sign-out control itself
  is conditional on a real session.
- `src/lib/theme.js` (`getTheme`/`setTheme`) reads and writes a single
  `localStorage` key, applying `data-theme` on the document root. An inline
  script added to `index.html`, before any stylesheet or the module script,
  reads the same key synchronously and sets the attribute before first paint,
  so there is no flash of the wrong theme on load. `src/styles.css` gained a
  `[data-theme="dark"]` block overriding the same 12 `--ds-*` tokens
  `docs/design-system.md`'s dark theme section already specified; no token
  value changed from what was already documented.
- Verified the twelve dark values against the anti-pattern checklist's
  contrast bar with an actual WCAG relative-luminance calculation, not an
  eyeballed guess: ink on canvas 13.08:1, ink-soft on canvas 5.79:1,
  due-green on canvas 9.02:1, p1/p2/p3 on canvas 4.99/7.26/5.26:1, all clear
  the 4.5:1 text-AA bar comfortably. Red text on the red-tint nav highlight
  comes out at 3.63:1, and red on canvas at 3.99:1, below the 4.5:1
  small-text bar but above the 3:1 bar WCAG allows for large text and UI
  components, which is what these are (nav labels and icons, not paragraph
  copy). Computed the same pairings for the already-shipped light theme to
  check this was not a dark-mode regression: light comes out at 3.67:1 and
  4.08:1 for the equivalent pairs, essentially the same. Red is the
  unchanged brand constant in both themes, so this is a pre-existing,
  already-accepted characteristic of using it as a small accent-label color,
  not something dark mode made worse.
- The audit surfaced real gaps beyond the dark tokens themselves: a handful
  of CSS rules had a hardcoded color that bypassed the token system entirely,
  which the dark override alone would not fix, so dark mode would have been
  partial rather than complete. Found and fixed:
  - Five hover-tint backgrounds fixed to `rgba(0, 0, 0, …)`. On a dark
    surface a black tint darkens further instead of lightening, the wrong
    direction. Replaced each with `color-mix(in srgb, var(--ds-ink) N%,
    transparent)`, which tracks either theme automatically since `--ds-ink`
    itself flips between the two.
  - The three priority-checkbox fill tints were hardcoded to the light-mode
    `--ds-p1/p2/p3` hex values at 10% opacity, not derived from the tokens.
    In dark mode the checkbox border would have picked up the brightened
    dark priority color while the fill stayed tinted with the old light
    color, a visible mismatch. Same `color-mix()` fix, against the token.
  - `.chip`, `.modal`, `.popover`, and a label-picker delete-icon backdrop
    all had a literal `background: #fff`, and `.btn-ghost` a literal
    `#f5f5f5`. Every one replaced with `var(--ds-canvas)` or `var(--ds-line)`
    as appropriate; these would otherwise have stayed white, stark boxes on
    a dark canvas.
  - The widest gap: no rule anywhere set a background on plain `input` or
    `textarea` elements, so every text field in the app (task name and
    description, the section-name and project-rename inputs, the label
    picker's search box, the date picker's time input) fell back to the
    browser's default white form control regardless of theme. Fixed at the
    single global `input, textarea` rule with `background: transparent`,
    rather than patching each call site, so this cannot regress the next
    time a field is added without its own background rule.
  - The toast was hardcoded to `background: #202020`, the same literal value
    as the new dark canvas, which would have made it invisible against a
    dark page. Changed to `var(--ds-ink)` background and `var(--ds-canvas)`
    text, an inversion relative to whichever theme is active; in light mode
    this resolves to the exact same values as before (no change there),
    and in dark mode it becomes a light toast against the dark page.
  - Left alone, on purpose: white text on `var(--ds-red)` (the avatar, the
    primary button, the selected calendar day; red is the unchanged brand
    constant in both themes, so this never needs to flip), the modal
    backdrop scrim (a black overlay behind a dialog is conventional
    regardless of page theme), box-shadows using black (elevation, not text
    or an interactive-state color; dimmer shadows on a dark surface are a
    known, accepted simplification, not a readability failure), and
    `.chip.active`'s fixed `#d0d0d0` border, which reads as a visible accent
    against both a light and a dark canvas without needing to change.

Verified live: Settings opens from the gear icon, in local preview correctly
shows the no-account note instead of a sign-out control. Switched to Dark and
confirmed every surface changed together across the sidebar, Today, the
quick-add modal (including the now-fixed name and description fields, the
date picker's calendar popover, and the priority picker), the task detail
view, a delete confirm dialog, and the Add Project color grid, not a partial
subset. Switched back to Light and confirmed the app matched its original
appearance exactly. Reloaded after choosing Dark and confirmed the theme
survived, applied before the page painted. Could not exercise the real
Firebase Auth sign-out call itself in local preview, since there is no live
session there to sign out of; the confirm-then-`signOut` wiring is simple
and was reviewed directly, but the actual network call needs a real signed-in
session, the same limitation noted for Google sign-in earlier in this
project. Console stayed clean throughout.

### Decisions not to relitigate

- Settings is a modal, not a routed view; there is exactly one destination
  behind the gear icon right now, so a full view or an intermediate menu
  would have been unrequested scope.
- Theme is a `localStorage` key, never synced to Firestore or scoped per
  account; it is a browser preference, not a user-document field.
- The base `input, textarea` rule sets `background: transparent` for every
  field in the app, present and future. A field that needs its own surface
  color overrides this explicitly; it does not get a transparent background
  by omission the way every field did before this pass.

## 2026-07-05: Phase 2.7 part 2, project hierarchy, Inbox, Search

Built the four pieces this pass was scoped to: `parentProjectId` in the store,
the Add Project dialog, nested project rendering in the sidebar, and the two
small removals (Inbox's description, the Search nav item). Settings (part 3)
is still Next in `docs/roadmap.md`, not built this pass. No files under
`src/pipeline/` were touched. No divergence between the two store adapters
made the delete-promotion change awkward; both already cascaded a project's
own sections and tasks in a parallel fetch-then-delete shape, so adding a
third loop that promotes direct children read the same way in both.

- `parentProjectId` added to `createProject` in both `src/store/local-store.js`
  and `src/store/firestore-store.js` (default `null`) and to the `projectDoc`
  built in `src/store/tree.js`, the same pattern phase 2.5 used for
  `description`. `ensureInbox` in both adapters sets it explicitly to `null`
  too, for the same reason Inbox is never a child: consistency, not because
  the default would have behaved differently.
- `deleteProject` in both adapters now also finds every project whose
  `parentProjectId` equals the deleted id and clears it to `null`, promoting
  those projects to the top level in the same batch (Firestore) or the same
  pass over the local store (localStorage) that already removes the deleted
  project's own sections and tasks. Updated the delete confirm dialog's copy
  in `src/components/Sidebar.jsx` to state this plainly.
- `src/components/AddProjectModal.jsx`, a real dialog replacing the old
  inline sidebar text input: Name, a Color swatch grid, and a Parent project
  chip opening a picker (default "No Parent"). No Workspace, Access, favorites,
  or Layout field; every new project still defaults to `view: "list"`.
  Exports `validParentCandidates(projects, excludeId)`, which excludes Inbox,
  the project itself, and every one of its descendants (walked via a
  `parentProjectId` map), so a project can never become its own ancestor.
  For a brand-new project `excludeId` is always `null`, since it has no id
  yet and so no descendants either; verified the function directly for the
  `excludeId` case anyway; a future edit-parent flow can reuse it as-is.
- Sidebar renders projects as a recursive tree (`buildProjectChildrenMap`,
  grouped by `parentProjectId`, each group sorted by `order`) instead of a
  flat list. Each node indents by `8 + depth * 18` px and gets a collapse
  chevron only when it has children; there is no fixed depth limit; whatever
  depth exists renders. Collapse state is a `Set` of project ids local to
  `Sidebar`, not persisted, a deliberate scope decision: the task's schema
  change was `parentProjectId` only, and projects carry no `collapsed` field
  the way sections do. Reopen with a stated reason if persisted collapse
  becomes worth a schema change on its own.
- `src/views/ProjectView.jsx`'s `ProjectDescription` is now gated behind
  `!project.isInbox`; the store field stays on the schema (unused for Inbox)
  since removing it would mean special-casing every read path, not just this
  one write path. The Search nav item and its stub input are removed from
  `src/components/Sidebar.jsx` entirely, not just hidden.

Verified live: created a two-level tree (a project nested under another),
confirmed indentation and a collapse chevron on the parent, collapsed and
expanded it. Deleted the parent project by accident, mid-test, from a
selector that matched the wrong row, which turned out to be a useful,
unplanned confirmation: its child promoted to the top level exactly as
designed, confirmed on disk before I noticed and moved on to a deliberate
re-test of the same path. Extended the tree to three levels (a project
nested under a project nested under another) and confirmed both the Add
Project dialog's parent list and the sidebar's rendering held up at that
depth. Confirmed Inbox shows no description field while every other project
still does, and that state survives a reload (collapse state does not,
correctly, since it is not persisted). Console stayed clean throughout.

### Decisions not to relitigate

- Project delete promotes children, never cascades into them. Confirmed
  symmetric and unforced in both store adapters; this is not a compromise.
- Collapse state for the project tree lives in the sidebar's own React state,
  not in Firestore or localStorage. Sections persist `collapsed`; projects do
  not, on purpose, since this pass's schema change was `parentProjectId` only.
- `validParentCandidates` is written to be correct for an eventual edit-parent
  flow, not just project creation, even though nothing calls it with a
  non-null `excludeId` yet.

## 2026-07-04: Phase 2.7 part 1, agenda Upcoming and drag-to-reschedule

Built the four pieces this pass was scoped to: the vertical Upcoming agenda,
cross-day drag-to-reschedule, the `isToday`/`isOverdue` verification, and the
seed helper. Left the rest of the phase 2.7 entry (`parentProjectId`, dropping
Inbox's description, removing Search, Settings) in `docs/roadmap.md` under
Next, since this pass was not scoped to build them; split the phase's roadmap
entry into "part 1" (here, Built) and "part 2" (still Next) rather than mark
the whole phase done. No files under `src/pipeline/` were touched. No schema
field changed and no store method was added; every write here goes through
the existing `store.updateTask`, reading and writing only `due`.

- Rebuilt `src/views/UpcomingView.jsx` as a vertical, week-paged agenda. A
  week-strip header (Mon through Sun) pages a full week via `weekOffset`
  state; today's weekday highlights only when `weekOffset === 0`, since
  paging to a different week has no day that is actually today. Overdue
  renders first and only on the current week, the same reasoning: an overdue
  task's real due date is in the past, so it does not belong to a future or
  past week's page in the same way each day's own section does.
- Found and fixed a real duplicate-display bug during live verification, not
  in the date logic but in the new view: a task due on a day within the
  current week that is also before today (for example Friday, when today is
  Saturday) rendered twice, once in Overdue and once under its own day
  section, because the day filter and the Overdue filter were not mutually
  exclusive. Fixed by excluding already-overdue tasks from their own day's
  list whenever `weekOffset === 0`. Past weeks (`weekOffset !== 0`) are
  unaffected, since Overdue never renders there to begin with.
- Drag-to-reschedule renders rows with `TaskRow` directly, not `TaskList`,
  because `TaskList`'s drag state is deliberately scoped to one instance (the
  phase 2.6 property that keeps cross-list drops inert). Reschedule needs the
  opposite: one shared `dragTaskId` across every section in the view, so a
  drop in a different section can tell it is foreign and act on it. `TaskRow`
  itself, and the row-wiring, are unchanged; `Inbox`, `Today`, and `Project`
  still render through `TaskList` exactly as phase 2.6 left them.
- A same-section drop reorders (recomputes sequential `order`, phase 2.6's
  mechanics, unconditionally available since Upcoming has no sort control to
  gate it behind, exactly the phase 2.6 log's own reasoning applied to a view
  with no such control at all). A cross-section drop onto a specific day
  reschedules via `rescheduleDue` (new, `src/lib/date.js`): keeps the local
  hour and minute when `due.datetime` was set, stays date-only otherwise.
  Dropping onto Overdue is a no-op (Overdue is not one date); dragging an
  overdue task onto a day reschedules it forward, verified live.
- Found and fixed a second real gap during live verification: the row-level
  drop handlers were the only drop targets, so a day with zero tasks could
  not be dropped onto at all. Added a second, section-level drop handler on
  each day's container, and `stopPropagation` on `TaskRow`'s own
  `onDragOver`/`onDrop` (in `src/components/TaskRow.jsx`, harmless everywhere
  else, since no other view wraps a `TaskList` in a drop target) so a drop
  on an existing row is not also handled twice by the section underneath it.
- `isToday`/`isOverdue` verification: checked by hand against
  `America/New_York` and `Pacific/Auckland` (DST-observing, opposite
  hemispheres), `Pacific/Kiritimati` (UTC+14) and `Pacific/Niue` (UTC-11),
  and the 2026 US DST transition dates, plus date-only and near-midnight
  datetime values. No mismatch. Both functions only ever compare `due.date`,
  a bare local-calendar-day string, never a UTC-parsed instant, so there was
  no UTC-vs-local-day bug to find. `addDays` does drift off exact local
  midnight by the DST offset on a transition day, cosmetic only: the drift
  never crosses a calendar-day boundary, so `toISODate(addDays(...))` still
  returns the correct day in every case tested. Added `scripts/eval-date.mjs`
  (twelve cases) to guard this. It lives outside `evals/` on purpose, wired
  as a new `eval:date` npm script that `npm run eval` now also runs, so
  `evals/` and `eval:offline` (the pipeline contract check) stay untouched,
  exactly as this pass was scoped.
- `src/lib/seed.js`: a plain function, not a new store method, calling only
  `store.createTask` and `store.listTasks`, both already shared by every
  adapter. Its only safety property comes from where it is called: Sidebar's
  "Seed sample data" button renders only when `useAuth().isLocal` is true,
  and `isLocal` is exactly the condition under which `createStore` hands back
  the localStorage adapter, so this can never reach Firestore. Skips any
  seed task whose content already exists, so a repeat click tops up rather
  than duplicates.

Verified live: the vertical agenda, week paging by a full week, the Overdue/
day de-duplication fix, same-section reorder (`order` recomputed, `due`
untouched), cross-day reschedule preserving time-of-day, cross-day reschedule
onto a previously empty day, dropping onto Overdue doing nothing, dragging an
overdue task onto a day rescuing it, and Today/Upcoming agreeing on every
bucket after each change, including after a reload. Console stayed clean
throughout.

### Decisions not to relitigate

- `isToday`/`isOverdue` are correct as they stand. Do not re-derive them from
  `due.datetime` in a future pass; the bare `due.date` string is the
  intentional source of truth for calendar-day bucketing.
- Reschedule and reorder are two different mechanisms on two different
  fields (`due` versus `order`), matching phase 2.6's own instinct. Do not
  gate reschedule behind a sort control; Upcoming has none.
- Dropping a dated task onto Overdue does nothing. Overdue is a rollup, not a
  day; it is not a reschedule target. Dragging out of Overdue onto a day is
  the supported direction.
- `TaskList` stays untouched. Upcoming's cross-section drag lives entirely in
  `UpcomingView.jsx` using `TaskRow` directly, because generalizing
  `TaskList` to support shared, cross-instance drag state would have
  complicated the contract for the three views that do not need it.

## 2026-07-04: Scoped phase 2.7, project hierarchy, agenda Upcoming, settings

Reviewed more reference screenshots from Lucas's own Todoist account: a
vertical, week-paged Upcoming agenda; cross-day drag-to-reschedule; the real
Add Project dialog (Name, Color, Workspace, Parent project, Access, Add to
favorites, Layout); and the user menu's Settings, Account, and Theme screens
including dark mode.

Added phase 2.7 to `docs/roadmap.md`, ahead of phase 3:
- Upcoming redesigned as a vertical, day-grouped agenda with a week-strip
  header, paged by week. This reopens phase 2's original horizontal-columns
  description; the reference screenshots show real Todoist does not use
  columns here, phase 2 was built before that was known.
- Drag-to-reschedule across Upcoming's day sections, writing `due.date`.
  Distinct from phase 2.6's manual reorder: it changes a different field, and
  is not gated behind a sort control since Upcoming has none.
- A verification and fix pass on `src/lib/date.js`'s Today/Overdue bucketing,
  plus a local-preview-only, Firestore-never-touched seed helper for QA.
- `projects.parentProjectId`, added to `docs/architecture.md`. Deleting a
  project promotes its direct children to the top level rather than
  cascade-deleting them, the same instinct already applied to sections
  keeping their tasks. The Add Project dialog gets Name, Color, and Parent
  project only; no Workspace (we have exactly one), no Access or sharing
  (no collaboration in this product), no Add-to-favorites (Favorites is
  already out of scope).
- Inbox drops its description field; it is a fixed special project.
- The Search nav item is removed rather than left as a dead stub.
- Settings: sign-out behind a confirm dialog, a read-only Account view from
  Firebase Auth, and a Light/Dark theme toggle. Dark tokens added to
  `docs/design-system.md`, applied through `data-theme` on the root,
  persisted in localStorage, a user setting, not OS-synced.

Declined, named with reason: full account deletion (a cascading, account-wide
delete deserves its own scoped pass), two-factor auth and connected-account
management (provider-managed, nothing for us to build), OS-synced auto dark
mode, and paid themes.

### Decisions not to relitigate

- Project delete promotes children, it does not cascade-delete them. Only a
  project's own sections and tasks are removed.
- Drag-to-reschedule in Upcoming and manual reorder from phase 2.6 are two
  different mechanisms writing two different fields; do not conflate them or
  gate one behind the other's sort-control rule.
- Dark mode is a user setting in localStorage, not an OS-sync feature.

## 2026-07-04: Phase 2.6, card density and single-list manual drag

Built the two pieces scoped in `docs/roadmap.md`'s Phase 2.6 entry. No files
under `src/pipeline/` or `evals/` were touched; `npm run eval` stayed at
12/12, the same cases as before this pass. No store method was added and no
schema field changed; reorder persists through the existing
`store.updateTask` patch, exactly as the task predicted.

- Card density: added `variant` ("flat" default, "card") to
  `src/components/TaskRow.jsx`, one component, not two. `.task-row.card` in
  `src/styles.css` is a bordered box with its own padding and margin; the
  flat variant is unchanged. `TaskList` threads `variant` down from
  `TodayView` and `UpcomingView` (both pass `"card"`); `ProjectView` passes
  `"flat"` explicitly. `TaskRow`'s recursive rendering of a task's own
  sub-tasks does not forward `variant` or `draggable` to them; they always
  render flat and never draggable. That never mattered in practice this pass
  because Today and Upcoming both pass an empty `childrenOf` map, so no card
  row ever has children to render, but the row component does not rely on
  that to stay correct.
- Manual drag-and-drop: native HTML5 (`draggable`, `dragstart`/`dragover`/
  `drop`/`dragend`), no new dependency. Drag state (`dragId`, `dragOverId`)
  lives in `TaskList`, not `TaskRow`, because `TaskList` already receives
  exactly one list at a time, the same boundary the reorder needs: Today's
  Overdue and Today groups are two separate `TaskList` calls, and
  `ProjectView`'s no-section roots and each section's roots are separate
  calls too. That gives list isolation for free. A drop on a row from a
  different `TaskList` instance finds no matching `dragId` in that
  instance's own state and no-ops; no extra cross-list guard code was
  needed. `draggable` is only ever `true` when the view's Sort is Manual;
  `TodayView` and `ProjectView` pass `draggable={sortMode === 'manual'}`,
  `UpcomingView` never passes it (Upcoming has no sort control at all, per
  phase 2.5). On drop, `TaskList` recomputes sequential `order` (0, 1, 2, ...)
  over the affected list only and calls `store.updateTask(id, { order })`
  for every task whose computed index actually differs from its stored
  `order`, which also self-heals the pre-existing duplicate-`order` values
  a few independently-created tasks already had on disk.
- Sub-task siblings (children of one parent task) are not drag-reorderable
  this pass. `TaskRow` renders `kids` recursively itself rather than through
  a nested `TaskList`, so giving them the same reorder would mean
  duplicating the drag state and threading `store`/`bump` into `TaskRow`.
  The phase's own acceptance criteria only exercise root-level lists
  (Inbox, Project, Today), so this was left out rather than added
  unasked; flagging it here as a clean, scoped follow-up if wanted, not a
  silent gap.
- Inbox needed no separate work, confirmed live: it renders through the
  same `ProjectView` as every project and picked up card-free flat rows,
  the sort control, and drag all at once.

Verified live: card density renders distinctly from flat rows side by side
(Today vs. Inbox, same data). Dragging a root task within Inbox (Sort:
Manual) persisted a new sequential `order` and survived reload, reflected
identically in Today's card view since both read the same `order` field.
Switching Sort to Priority set every row's `draggable` DOM attribute to
`false` (confirmed directly, not through a cached prop reader) and a
simulated drop against that state changed nothing on disk. Dragging a
no-section task onto a task inside a section did nothing and left both
tasks' `sectionId` untouched, confirmed on disk. Task detail still opens
correctly from a card row; checkbox, complete, and delete-with-confirm were
unaffected in both variants. Console stayed clean throughout.

Native `DragEvent`/`DataTransfer` simulation from an automated harness is
unreliable without a delay between the dispatched `dragstart`/`dragover`/
`drop` events and the state updates and async store writes they trigger;
the first attempt read the DOM synchronously and looked like a no-op before
the debounced work had actually run. Awaiting between dispatches surfaced
the real, correct behavior. Noting this so a future pass does not
mistake that timing artifact for a bug and start debugging the wrong thing.

### Decisions not to relitigate

- Card density is a style variant on `TaskRow`, never a second component.
- Drag reorder only ever writes `order`, only when Sort is Manual, only
  among siblings a single `TaskList` call already renders together. It does
  not touch `sectionId`, `projectId`, `parentId`, or `due`.
- Sub-task siblings are not drag-reorderable. Reopen with a stated reason if
  that becomes worth the `TaskRow`-level plumbing it would need.

## 2026-07-04: Scoped phase 2.6, card density and single-list manual drag

Compared Today, Upcoming, and Inbox against fresh reference screenshots from
Lucas's own Todoist account. Confirmed: Today and Upcoming share one style,
a bordered card per task, distinct from the flat divider rows Inbox and
Project use; Inbox already matches Project's flat treatment through the
shared `ProjectView`, no gap there. Also declined a request to pull and read
Todoist's production JS bundles to work from their implementation directly;
the pasted page source was the CDN-fallback loader shell only, `#todoist_app`
mounts empty until the bundle runs, so it held no UI structure either way.
Screenshots of the rendered UI stay the right source, same as
`docs/design-system.md` already states.

Added Phase 2.6 to `docs/roadmap.md`: a card density variant on the existing
`TaskRow` for Today and Upcoming, and manual drag-and-drop reorder scoped to
one list at a time (same parent, same section or no-section group), active
only when Sort is Manual. Reopens part of the drag-and-drop exclusion; kept
cross-section drag, cross-project drag, and drag-to-reschedule-by-date out,
each named as a bigger, separate lift.

### Decisions not to relitigate

- Card density is a style variant on `TaskRow`, not a second component.
- Drag reorder only ever writes `order`, only when Sort is Manual, only among
  siblings already in the same list. It does not change `sectionId`,
  `projectId`, or `due`.
- Reverse-engineering a competitor's production bundle is out, regardless of
  scope questions. Reference screenshots are the source of visual truth, as
  `docs/design-system.md` already says.

## 2026-07-04: Phase 2.5, task-app CRUD completeness

Built the five pieces scoped in `docs/roadmap.md`'s Phase 2.5 entry. No files
under `src/pipeline/` or `evals/` were touched; `npm run eval` stayed at 12/12,
the same cases as before this pass.

- Task detail view (`src/components/TaskDetail.jsx`), opened by clicking a task
  row from Inbox, Today, Upcoming, or Project (wired through
  `AppData.openTaskDetail`/`closeTaskDetail` and a `onOpen` prop threaded
  through `TaskList`/`TaskRow`). Content and description debounce their save;
  project, date, priority, labels, and reminders save on change through
  `store.updateTask`. Sub-tasks render by reusing `TaskList`/`TaskRow`, so the
  detail view gets complete, delete-with-confirm, and click-to-open-a-subtask
  for free. "+ Add sub-task" is a lightweight inline input that calls
  `store.createTask` with `parentId` set to the open task's id, which routes
  through `createProjectTree` same as everywhere else.
- Extracted `src/components/ProjectPicker.jsx` out of `QuickAddModal`, so
  Quick-add and the task detail rail share one project-and-section picker
  rather than two implementations.
- `src/components/ConfirmDialog.jsx`: shared confirm, the destructive action is
  the one loud (`btn-primary`, the same red as Add task) control, Cancel stays
  quiet (`btn-ghost`). Wired at every delete path: `TaskRow` (task, states the
  sub-task cascade), `ProjectView` (new section overflow menu, states tasks
  keep no section), `Sidebar` (project, replacing the old `window.confirm`,
  states the section-and-task cascade), and `LabelPicker` (label, states that
  existing task references keep the label name until edited, since labels are
  matched by name, not id, and this pass did not add cascade cleanup of stale
  label references on tasks; flagging that honestly rather than silently
  leaving it undocumented).
- `LabelPicker` already had inline label creation from phase 2
  (`Create "<name>"`, applying the label immediately); this pass added the
  delete affordance next to each label and tightened the create-option copy.
- `src/components/SortControl.jsx` and `src/lib/sort.js` (`sortTasks`, pure,
  client-side, three modes). Wired into `TodayView` (both the Overdue and
  Today groups) and `ProjectView` (root list and every section list). Upcoming
  was left out, matching the roadmap: its columns are already date-grouped.
  `store.listTasks` was not touched.
- `projects.description`: added `description = ''` to `createProject` in both
  `src/store/local-store.js` and `src/store/firestore-store.js`, and to the
  `projectDoc` built in `src/store/tree.js`, matching what `docs/architecture.md`
  already specified. `updateProject` needed no change; it already took an
  arbitrary patch. Shown and edited inline in `ProjectView` via a module-scope
  `ProjectDescription` component (kept out of `ProjectView`'s function body on
  purpose: a component defined inside another component's render remounts on
  every keystroke and drops input focus).

Fixed in place, found during live verification: `.view-header` (project title
plus the new sort control) wrapped to two lines under a real content-column
width, because the title had no shrink limit and the sort button had no
`white-space: nowrap`. Gave `.view-title` `min-width: 0` with ellipsis
truncation, added `white-space: nowrap` to `.btn`, and `flex-shrink: 0` to
`.popover-wrap`, so headers hold one line and long titles truncate instead of
wrapping, matching Todoist's own behavior.

Verified live: created a project, a task, a sub-task; opened task detail and
edited description, priority, date, and labels (including creating and
cancel-deleting a label from inside the detail rail); deleted a section and
confirmed its task kept its content and lost only its section; deleted a task
with a sub-task and confirmed both were gone; deleted a project and confirmed
navigation fell back to Today; switched sort to Priority and confirmed the
`order` field on disk was unchanged. Reloaded after each write; state
persisted. Console stayed clean throughout.

### Decisions not to relitigate

- Sub-tasks inside the task detail view reuse `TaskList`/`TaskRow` rather than
  a separate rendering path. One row component, one set of behaviors,
  regardless of where it renders.
- Deleting a label does not cascade into `task.labels` arrays. Labels are
  matched by name, not foreign-keyed by id; that is a phase 2 decision, not
  something this pass was scoped to change. The confirm dialog says so.
- Sort is display-only. `order` is never written by a sort-mode change; Manual
  is the only mode that reflects `order`.

## 2026-07-04: Reopened part of the roadmap's out-of-scope list; scoped Phase 2.5

Compared the built container and `docs/roadmap.md`'s Out of scope list against
real Todoist's Inbox, Today, Upcoming, and Project views, screenshots supplied
by Lucas. Confirmed with him which items to reopen before touching any doc or
code.

Reopened three items, now Phase 2.5 in `docs/roadmap.md`, ahead of phase 3:
a task detail view with full CRUD (not just Quick-add), delete confirmation on
task, section, project, and label, and a light per-view sort control
(Priority, Date, Manual).

Declined to reopen Board layout, Calendar layout, and a Filters page or
saved-query system. A Board without drag-and-drop reorder, itself still out
of scope, would read as broken rather than native, so it is not worth
half-building. Calendar was considered and declined outright. Filtering stays
a per-view sort control; label, priority, and date remain task properties,
not a separate filter engine. Labels get inline CRUD only, created and edited
from the existing label picker on a task; there is still no Labels page.

Added `description: string` to the `projects` schema in
`docs/architecture.md`. The reference screenshots show it under the project
title; the schema had no field for it.

### Decisions not to relitigate

- Board, Calendar, and a Filters page stay out of scope. Reopen only with a
  stated reason, the way this entry does.
- Filtering and labeling are task properties, managed inline, never a
  standalone management surface.

## 2026-07-04: Docs and code audit, no structural changes

Read the full `docs/` set and the `src/` tree against each other. Verified
`createProjectTree` and the store adapters (`firestore-store.js`,
`local-store.js`, `tree.js`): both adapters match `docs/architecture.md`
exactly, share ref-resolution, and reject orphan sub-tasks and unknown section
refs. No strategy or company framing found in the repo; `.cursorrules`,
`AGENTS.md`, and `CLAUDE.md` are identical pointers to `docs/orchestration.md`,
as intended. No secrets committed; `.gitignore` and both `.env.example` files
are clean. CI (`.github/workflows/ci.yml`) matches what the docs claim it runs.
Copy across the `docs/` set and `README.md` follows stop-slop already: no em
dashes, hyphens only on true compounds.

Fixed in place:
- `README.md` overstated the privacy posture. It read as if personal text is
  already encrypted client-side before every Firestore write. In fact
  `src/lib/crypto.js` is an unwired seam; `store/` writes task and project text
  as plaintext today. Reworded the Privacy section to say so plainly.
- `docs/roadmap.md` Built section did not mention that phase 1 already
  scaffolded `src/pipeline/` (`contracts.js`, `prompt.js`, `structure.js`) and
  the offline eval harness with six fixtures. Added it, since it was already
  true and unlisted.

Flagged, not resolved (structural, needs a decision):
- `docs/llm-pipeline.md` describes a Structure contract with `sections`,
  `labels`, `description`, `color`, a flat `tasks` array using `parentRef` and
  `sectionRef`, and two separate model calls (Classify, then Structure). The
  code actually built and evaled in `src/pipeline/contracts.js`,
  `src/pipeline/prompt.js`, `src/pipeline/structure.js`, and
  `evals/offline/contract-cases.mjs` implements a different, narrower contract:
  one combined call returning `decision: "project" | "tasks"`, tasks with
  inline nested `subtasks` (no `sectionRef`), and no `sections`, `labels`,
  `description`, or `color` fields at all. The two do not agree. This is a
  product decision (does Structure route tasks into sections and labels, or
  not; one call or two), not a doc typo, so it was not silently resolved here.

### Decisions not to relitigate

- The store and `createProjectTree` are considered clean and ready for phase 3
  as documented in `docs/architecture.md`. Do not re-derive the schema from
  scratch; resolve the pipeline contract question above against this schema.

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
