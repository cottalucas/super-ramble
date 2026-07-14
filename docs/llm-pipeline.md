# LLM pipeline

The detailed contract for phase 3. It is written now so phase 2 builds the store
to fit it. The pipeline runs in three stages, not four: Classify and Structure
are one combined model call, not two, per the resolution log entry dated
2026-07-06. Structure emits a tree shaped for `store.createProjectTree`, which
is why the task app is built first.

## Stage 1: Transcribe

Real, live, and shipped: `POST /api/transcribe`, audio in, text out. Recorded
then transcribed, not live-streamed: one clip, one transcription call, matching
the decision this doc has stated from the start. Text input is a pass-through,
still true; the textarea takes typed text directly, no call at all.

- Contract: `{ audioBase64: string, mimeType: string, durationSeconds: number }`
  in, `{ transcript: string }` out. JSON, not multipart, matching
  `/api/structure`'s existing request shape so the Function needs no new
  body-parsing dependency; the outgoing call to Groq is multipart, built with
  Node 20's native `fetch`/`FormData`/`Blob`, not the `openai` package, since
  that is the one thing Groq's own API actually requires multipart for.
- Runs on Groq's hosted Whisper Large v3 Turbo
  (`whisper-large-v3-turbo`, `https://api.groq.com/openai/v1/audio/transcriptions`,
  both verified live against console.groq.com/docs/speech-to-text, the same
  discipline `ANTHROPIC_STRUCTURE_MODEL` already follows for its own model
  id), an OpenAI-compatible transcription API. $0.04/hour, verified against
  the same page; a free tier around 2,000 requests/day, a wide margin over
  this app's realistic volume. See the resolution log entry dated 2026-07-08
  for the full cost math.
- A hard cap of 300 seconds (5 minutes) per recording, and 10MB on the
  decoded audio payload; both rejected with `400` before any Groq call.
  Five minutes is a product-framing limit (docs/brief.md: "capture stays
  deliberately simple"), not a technical one: a 5-minute browser recording
  is a few MB at most, nowhere near Groq's own 25MB free-tier file-size cap
  or the 10MB ceiling here.
- Cost is logged to the exact same `users/{uid}/llmUsage/{YYYY-MM-DD}`
  document Structure already writes to, through the same
  `checkAndReserveLimit`/`logUsage` functions, reused as-is, not duplicated:
  one shared daily request/cost ceiling across both endpoints, not a second
  parallel limit system. `logUsage` gained an optional `audioSeconds`
  counter for this; `inputTokens`/`outputTokens` don't apply to a
  transcription call and are not forced to carry duration data.
- **No dedicated trace collection, unlike Structure's `structureTraces`.**
  This is a deliberate scope decision, not an oversight: Structure is the
  product, and its trace-and-eval flywheel exists to make that one call
  better over time, a call with a prompt of our own to iterate against.
  Transcribe is a fixed, unconfigurable third-party call with no prompt of
  our own; there is nothing for a parallel trace collection to feed. If cost
  visibility alone is ever wanted, `llmUsage` already provides it.
- **The transcribed text lands in the same textarea as typed text, and
  nothing auto-submits.** The user still clicks "Make tasks" themselves.
  This is deliberate, not a placeholder: voice quality needs watching for a
  while before it is trusted to flow straight into Structure unreviewed. A
  future pass may remove this checkpoint; that is a separate, later decision,
  not approximated here.
- The recording UI (`src/components/VoiceRecorder.jsx`) gets its own
  dedicated view once recording actually starts, `SuperRambleModal.jsx`'s
  `state` gains a `recording` value alongside `loading`/`error`/`preview`,
  each already a full modal-body state; a live audio-level indicator against
  the `MediaStream` (native Web Audio API `AnalyserNode`, no canvas, no
  waveform library), a timer, and an unmistakable stop button, all bigger and
  centered instead of a small corner widget next to the textarea. Matches
  `docs/roadmap.md`'s Out of scope line: "Competing on capture quality or
  live-audio streaming," a prominence fix, not new capture capability. All
  real permission states are handled (granted, denied, no device found,
  `MediaRecorder`/`getUserMedia` unsupported entirely), not just the happy
  path. See docs/design-system.md's "Recording indicator" section and the
  resolution log entry dated 2026-07-08.

## Stage 2: Structure

One combined call decides whether the dump is loose tasks or a structured
project, shows why, and, when it is a project, produces the tree the store
will write, all in one round trip. Making the decision visible is a core
product moment, so `reasoning` is surfaced in the UI regardless of which way
it lands.

- Input: `{ transcript, existingProjects }`.
- Output:
  ```json
  {
    "decision": "project | tasks",
    "reasoning": "string",
    "confidence": 0.0,
    "targetProjectId": "string or null",
    "project": { "name": "string" },
    "sections": [{ "ref": "string", "name": "string" }],
    "tasks": [
      {
        "content": "string",
        "priority": 1,
        "due": "string or null",
        "sectionRef": "local ref or null",
        "subtasks": [
          { "content": "string", "priority": 1, "due": "string or null" }
        ]
      }
    ],
    "needsClarification": false,
    "clarificationQuestion": "string or null"
  }
  ```
- `decision` is `"project"` when the dump describes one coherent effort,
  `"tasks"` when it is loose, unrelated items. One response carries both the
  decision and, when it is a project, the structure; there is no separate
  classify-then-structure round trip.
- `confidence` is a number from 0 to 1, the model's own calibration of
  `decision`. A low `confidence` should lean the model toward `"tasks"` rather
  than inventing a `"project"` it is not sure fits: a bad scaffold is worse
  than none, per `docs/brief.md`'s constraints. This still holds exactly as
  stated (see the resolution log entry dated 2026-07-06); the line below adds
  a distinct, separate axis, not a replacement for it.
- `needsClarification` is for routing uncertainty only, never for uncertainty
  about whether something is project-shaped. Those are two different
  questions: "is this a coherent project or loose tasks" is answered by
  `confidence` and the `"tasks"` fallback above, never by a clarifying
  question; "does this belong to something that already exists" is the one
  worth asking about, and only when genuinely unclear, could new content
  extend one of `existingProjects`, or is it clearly its own new thing, or
  (when two `existingProjects` entries share a name) which one it means.
  When content is clearly new and unrelated to every `existingProjects`
  entry, the model proposes the new project confidently, no question first;
  Confirm/Cancel already gates anything from actually being written. See the
  resolution log entry dated 2026-07-08, which reopens half of the
  2026-07-06 decision on purpose (this distinction) while leaving the
  confidence-calibration half untouched.
- `targetProjectId` routes into an existing project by id instead of
  synthesizing one; it must resolve to one of `existingProjects`'s ids.
  `project` carries only `name` this pass; no `color`, no `description`. Both
  stay out until a later pass, alongside `labels` (see the resolution log
  entry dated 2026-07-06 for why).
- `sections` is optional and appears only when the dump names distinct
  workstreams that benefit from separation; most dumps get none. Each entry is
  a local `{ ref, name }` pair, `ref` unique within the response.
- `tasks` nests `subtasks` inline rather than using a flat list with
  `parentRef`; a task can carry an optional `sectionRef` naming one of
  `sections`'s refs, which must resolve. A subtask has no `sectionRef` of its
  own; it belongs to its parent task, not directly to a section. Neither task
  nor subtask carries `description` or `labels` this pass.
- Priorities map to 1 to 4. Dates are inferred from natural language, left as
  the model's own string, not yet normalized to an ISO value.
- If the dump is genuinely ambiguous, `needsClarification` is `true` and
  `clarificationQuestion` holds one short question instead of a guessed
  structure.
- `clarificationQuestion` must never reference an internal id (a raw
  Firestore document id means nothing to a user; there is no way to answer
  a question that asks them to pick one). This includes the case where two
  or more `existingProjects` share a name and routing is ambiguous: the
  question asks the user to disambiguate in their own words, a
  distinguishing detail they would know, or simply notes that two projects
  share that name, never by stating either one's id. A real live trace
  asked exactly this the wrong way on 2026-07-08; see the resolution log
  entry dated the same day, and `evals/fixtures/09-ambiguous-duplicate-
  project-name.json`'s `clarificationExcludes` assertion, which guards
  against it directly.
- The live call passes a JSON Schema built from this exact contract through
  the Anthropic Messages API's structured outputs (`output_config.format`),
  so the API constrains the response shape directly; the prompt no longer has
  to ask for "strict JSON, no prose". `src/pipeline/contracts.js`'s validator
  still runs on every response, checking what a schema cannot: `sectionRef`
  and `targetProjectId` actually resolve, `decision`/`project` stay coherent,
  numbers sit in their real range, and no content is invented. One corrective
  retry on failure, the errors appended to the prompt; a second failure fails
  closed, before it can reach Write. See the resolution log entry dated
  2026-07-06.
- Runs on Claude Sonnet. A deliberate, named exception to every other model
  call's Haiku default: docs/brief.md's "the structure has to be genuinely
  good" constraint makes structuring quality worth the extra cost. Every
  other call in this app stays on Haiku. See the resolution log entry dated
  2026-07-06 for the model id and the cost math behind the daily limits.
  **Not temperature 0.** This line said "temperature 0" from 2026-07-06
  until a live incident on 2026-07-14 proved it false: the pinned model,
  `claude-sonnet-5`, rejects `temperature` outright (a live `400`,
  `"temperature" is deprecated for this model"`), so the real live call has
  never set it and cannot without breaking every request. See the
  resolution log entry dated 2026-07-14 for what was actually tried, why it
  broke production within a minute of deploy, and how fast it was reverted.
  Do not reintroduce `temperature` on this call without first confirming,
  against a real request to `claude-sonnet-5` specifically (Workbench, not
  production), that it is accepted.

### Reference examples

The real Structure call sees more than written rules. `referenceExamples`
(a top-level Firestore collection, `docs/architecture.md`) holds `{
transcript, response }` pairs; `functions/index.js`'s `/api/structure`
handler fetches the current pool at request time (ordered `addedAt`
descending, capped at 30), formats it into the same labeled `PAST
REFERENCE EXAMPLES` block a file-based version used to produce, and appends
it to `STRUCTURE_SYSTEM_PROMPT_RULES`. The block states plainly that these
are historical reference material, not the current user's transcript, so
the model does not confuse them with live input; this matters for
`isGroundedInTranscript` too (`src/pipeline/contracts.js`, mirrored in
`functions/contracts.js`), which only ever checks a response's content
against the real transcript argument for the current call, never against
anything in this block.

**This moved out of source files and into Firestore**, so the pool can grow
from real usage between deploys, not only when someone edits a file and
redeploys. It started as `src/pipeline/referenceExamples.js`, a hand-picked
array of four (a clean single project with nested sub-tasks, a real
multi-section trip, a restraint case that stays loose tasks, a case where
sections earn their keep), hand-synced into `functions/referenceExamples.js`
the same way `SYSTEM_PROMPT` itself was. Those four are still exactly what
the live model sees first: `scripts/seed-reference-examples.mjs` copied them
into `referenceExamples` with `source: "seed"` before both files were
deleted; a seed document is never auto-deleted by anything below. Every
document beyond those four seeds arrives one of two ways: automatically
(`source: "auto-promoted"`, the trigger described under "Live capture and
the eval flywheel" below) or by hand (`source: "manual"`,
`scripts/review-queue.mjs`, during the monthly review).

This is still separate from `evals/fixtures/`, which still exists and still
does its own job: fixtures run through the offline harness (`npm run eval`)
with a mocked `callModel`, testing the pipeline's own plumbing (contract
validation, grounding, the retry path), never a real model call, never
touching Firestore. Reference examples exist to teach the live model;
fixtures exist to test the code around it. Neither collection substitutes
for the other, and moving reference examples to Firestore changed nothing
about that: `structureTranscript` (`src/pipeline/structure.js`) never
imports `src/pipeline/prompt.js` or touches Firestore either, so the
offline suite's zero-credit, zero-network guarantee holds exactly as
before, verified directly by running it with `functions/node_modules`
removed and with no network access assumed, not just asserted.

To edit the written rules half (not the example pool, which now only ever
changes through Firestore, either automatically or via
`scripts/review-queue.mjs`/`scripts/seed-reference-examples.mjs`): edit
`src/pipeline/prompt.js`'s `SYSTEM_PROMPT`, then copy the identical change
into `functions/index.js`'s `STRUCTURE_SYSTEM_PROMPT_RULES` (Firebase
Functions deploys only the `functions/` directory and cannot import
`src/pipeline`, docs/resolution-log.md, 2026-07-06). The contract validator
needed by auto-promotion below is a third hand-synced pair for the same
reason: `src/pipeline/contracts.js` <-> `functions/contracts.js`.
`scripts/check-prompt-sync.mjs` catches drift in both pairs, the rules text
compared byte for byte (the text itself is the artifact), the contracts
functions compared behaviorally against a shared set of probe cases (they
are code, not a string, so "matches" means "produces the same output," not
"is the same characters"). Runs in `npm run eval` and as its own `ci.yml`
step, so an edit to only one copy of either pair fails CI instead of
drifting silently until a live incident, the same failure mode that already
shipped once with the priority-direction bug (docs/resolution-log.md,
2026-07-08) and that the reference-examples file pair itself used to be a
second instance of, before moving to Firestore retired it.

Offline evals cannot prove any of this changed real model behavior; they
never call the real model, mocked or not. Whether the live model structures
better with a given example pool in context is a live-call question,
spot-checked by hand (`EVAL_ALLOW_LIVE=true npm run eval:live` or a real
`/api/structure` call), not asserted in CI.

## Stage 3: Write

Runs only on explicit user confirm. Translates the validated response into a
`store.createProjectTree` call (flattening the nested `subtasks` into
`parentRef` siblings, and carrying `sections` and each task's `sectionRef`
through unchanged, `src/pipeline/write.js`'s `toProjectTree`). Never writes
without confirmation. A pure function, no model call.

As of phase 3, part 8, a confident new-project proposal (`decision ===
"project"`, no `targetProjectId`) can also, on an explicit per-ramble
toggle defaulted off, write the exact same tree into the user's real
Todoist account: `toProjectTree`'s output goes straight into
`createTodoistClient(...).createTree(tree)` with no adapter, since
`src/todoist/index.js` and `functions/todoist.js` map that shape directly
to Todoist's Sync API commands server-side. This is not sync, a second
translation pass and a second write path, not a second source of truth: the
local write always runs first, and the Todoist write's own failure never
rolls it back. See `docs/architecture.md`'s "The Todoist client" section for
the full contract, including the priority-direction inversion and the
due-string passthrough.

## Eval assertions per stage

Structure (the combined decision-and-tree call):
- Schema-valid output.
- Decision accuracy on labeled fixtures.
- Calibrated confidence: high confidence on the clear-cut fixtures, low
  confidence on the genuinely ambiguous one, rather than a flat number that
  never moves.
- No orphan sub-tasks: every `subtasks` entry nests under the task that lists
  it, there is no dangling reference to resolve.
- Every `sectionRef` resolves to a declared section; `sections` appears only
  when it helps, most fixtures carry none at all.
- Priorities in 1 to 4, and the direction matters, not just the range: 1 is
  the most urgent, 4 is none. Where the transcript states urgency explicitly
  ("urgent," "not urgent," a named deadline), the priority number must match
  that direction. This is asserted per fixture, via an optional `priorities`
  (and `due`) map on the fixture's `expected` block, not just range-checked;
  see docs/resolution-log.md, 2026-07-08.
- Every `due` resolves to a real date.
- Routing into an existing project when one is named.
- No invented project when the dump is plainly flat.

Write:
- The produced batch matches the `createProjectTree` contract.
- Refuses any tree the schema rejects.
- A task removed in the editable preview is actually absent from
  `toProjectTree`'s output, its own sub-tasks absent with it; a renamed
  project and edited task content both carry through unchanged. See
  `scripts/eval-write.mjs` and "Live capture and the eval flywheel" below.

Guard suite:
- Empty input, oversized input, and a dump that is plainly flat must not produce
  a project.

## Cost posture

Haiku by default, with one named exception: the Structure call runs on
Sonnet, roughly 3x Haiku's per-token cost, because that call's quality is
the whole product. Offline evals use mocked responses and spend nothing.
Live evals are gated behind `EVAL_ALLOW_LIVE`. Every local live call writes a
trace, and `npm run trace:summary` watches spend against
`LLM_SPEND_CEILING_USD`. The Function's own per-user daily request and cost
limits are sized for Sonnet's cost on this one call; see the resolution log
entry dated 2026-07-06.

## Live capture and the eval flywheel

Every real Structure call persists to `users/{uid}/structureTraces`
(`docs/architecture.md`), including the user's own confirmed, confirmed-
with-edits, or cancelled decision: `POST /api/structure/outcome` records it
right when Confirm or Discard is clicked in the preview. `npm run
traces:list -- --uid <uid>` reviews the most recent traces, cancellations
and edited traces first (see below), since either is a higher-signal case
than a plain confirm: the model got something wrong that mattered, not just
a detail nobody noticed. `npm run traces:promote` turns a reviewed trace
into a new offline fixture, shaped exactly like `evals/fixtures/*.json`. A
plain confirmed trace promotes as-is (`--use-live-response`): a person
already looked at that exact tree and accepted it, unedited. A cancelled
trace, or a confirmed-with-edits trace, needs a hand-written correction
(`--expected-file`) instead: what the model produced there is, by
definition, not quite what was wanted, whether rejected outright or fixed
by hand, so neither can become an auto-trusted regression fixture as-is.
Every promoted fixture still has to pass `validateStructure` and the
grounding guard before it can be written; promoting a trace is not a way
around the contract, only a source of real cases for it.

**The preview is editable before Confirm, as of this pass.**
`SuperRambleModal.jsx` seeds an in-memory working copy of the validated
response (`TaskRow`'s `editable` prop, the sibling of the older, still-used
`readOnly` mode) the moment structuring succeeds, and every edit mutates
only that copy: per-task removal (a sub-task's own children go with it,
since they live nested inside it), an inline project-name edit, and
per-task content edits. Priority, due dates, and section membership are not
editable in the preview yet, each its own bigger lift; removing a section
itself is not supported either, only the tasks inside one. `src/pipeline/
write.js`'s `toProjectTree` needed no changes to honor this: it already
only ever reads whatever `tasks`/`project` it is handed, so passing the
edited copy instead of the original response at Confirm just works,
verified directly (a removed task's content is asserted absent from the
produced tree, not assumed; see "Eval assertions per stage" above).
`structured` (the model's real, untouched output) is never mutated and is
exactly what got persisted to the trace at request time already; editing
the preview only changes what Confirm actually writes and what the outcome
POST below reports about it.

That makes the outcome three real states now, not two:
`"confirmed_with_edits"` (`docs/architecture.md`'s `structureTraces` field
list has the full `edits` shape) sits alongside `"confirmed"` and
`"cancelled"`, sent whenever at least one removal, a real content edit (one
that actually changed a value; typing something back to its original
content is not reported), or a project-rename survived to the Confirm
click. A plain confirm with no edits still sends exactly the two-field POST
it always has; `edits` is never sent for `"confirmed"` or `"cancelled"`.

### Automatic grading

Grading is automatic now, not a command someone has to remember to run.
`functions/index.js` exports `gradeStructureTrace`, an `onDocumentWritten`
Firestore trigger on `users/{uid}/structureTraces/{traceId}`: the moment
`POST /api/structure/outcome` writes a real outcome onto a trace, this
fires, grades it, and writes the result back, before the review cadence
below ever has to touch it. Never part of a live user request; it runs
asynchronously, after the client has already gotten its response.
Same rule as always: this app's default Haiku model, never Sonnet, so
grading can never be confused with, or billed against, the real structuring
call it checks. The judge compares a trace's own `transcript` against its
own `response` and returns two simple verdicts, `"ok"` or `"flag"`, each
with a one-line reason: whether anything the transcript mentioned seems to
be missing from the response, and whether priority or due dates look
defensible given the transcript's own wording. It writes
`judgeCompleteness`, `judgeCorrectness`, `judgeNotes`, and `judgedAt` back
onto the trace as a merge write, `transcript` and `response` untouched.
Guarded against retriggering itself: it checks `judgedAt` is not already
set before doing anything, so the write that grades a trace produces one
harmless extra invocation, never a loop. `npm run traces:list` still shows
the judge fields when present.

`scripts/grade-traces.mjs`, the original manual command, still exists,
unchanged in what it does, now a backfill tool for the two real cases the
trigger cannot cover on its own: a trace written before the trigger
existed (nothing re-fires a trigger for a document that already sits
there with no new write coming), and a trigger invocation that itself
failed (its own `try`/`catch` logs the error and leaves `judgedAt` unset
rather than retrying).

**This grader only flags. It never edits `src/pipeline/prompt.js` and
never writes an eval fixture itself**, with exactly one narrow exception,
covered in "Auto-promotion" below, and even that exception only ever
touches `referenceExamples`, never the written rules. Its own judgment is
not infallible either, and should not be trusted blindly: spot-check its
verdicts against a real manual read on the same review cadence below, the
same "confirmed does not mean correct" lesson that already applied once to
a user's own Confirm click before this grader existed (a confirmed trace
with an inverted priority on two tasks, `docs/resolution-log.md`,
2026-07-08). A grader that flags things wrong often enough, or misses
things a manual read catches, is itself a finding worth a resolution-log
entry, the same as any other failure mode this flywheel surfaces.

### Auto-promotion

Two independent signals agreeing is the bar for anything to move on its
own; everything else waits for a human. Specifically: when a trace's
outcome is `"confirmed_with_edits"` (the user removed a task, edited
content, or renamed the project before confirming) **and** the grader
flags the model's original response, `gradeStructureTrace` reconstructs
the corrected tree the user's edits actually describe and, if that
succeeds and the result passes the same contract check
`scripts/promote-trace.mjs` already runs (`validateStructure`, the
grounding guard, this time via `functions/contracts.js`, the hand-synced
copy `src/pipeline/contracts.js` needs for the same cross-boundary reason
`SYSTEM_PROMPT` does), writes it into `referenceExamples` as `source:
"auto-promoted"`. `referenceExamples` stays bounded at 30 documents: a
write past that deletes the oldest auto-promoted one, never a seed.

**Reconstruction is honest about what it can and cannot do, and this is a
real, documented limitation, not an oversight.** `structureTraces` only
ever persists `response` (the model's real, untouched output) and `edits`
(a diff: `removedTasks`, `contentEdits`, `projectNameChange`), never a
second full corrected tree, so the corrected tree has to be replayed onto
a clone of `response`. Content edits are always reliable:
`contentEdits[].originalContent` is captured client-side on the first edit
to a task, before any change, so it always matches the pristine response.
Removals are reliable in the common case, a task removed without ever
being content-edited first, but **not** for the "edited, then removed"
sequence: `SuperRambleModal.jsx`'s own `removeTask` drops any pending
`contentEdits` entry for a task once it is removed, so `removedTasks[].content`
in that sequence holds the edited text, text that was never written back
into `response` by a matching `contentEdits` entry either. When
reconstruction cannot locate every `removedTasks` entry, it does not guess;
it reports the miss and auto-promotion is skipped for that trace, the same
fail-closed posture the rest of this pipeline already takes on anything it
cannot verify. A routing trace (`response.targetProjectId` set) is also
skipped outright, even with two agreeing signals: a reference example has
to stay generic and reusable across any future call, never tied to one
real historical Firestore id, the same reason the four original seed
examples all have `targetProjectId: null` to begin with, not by accident.

Every other flagged case, cancelled, a plain confirm the grader still
flagged, or a confirmed-with-edits trace where auto-promotion could not be
attempted or failed one of the checks above, is logged instead of acted
on: one `pipelineLearningLog` document (`docs/architecture.md`), `kind:
"flagged"`, `resolved: false`, a one-line summary built from the grader's
own notes (or the specific reason auto-promotion did not happen). A plain
"ok" on both signals writes nothing here at all; there is nothing worth a
human's monthly attention in a trace nothing flagged.

### Review cadence

Review real traces at least monthly, or after every 10 new traces,
whichever comes first; this is a low-volume, single-dogfooding-user app
today, so a fixed cadence catches drift without turning into busywork
against near-empty data. Each review:

1. `npm run traces:list -- --uid <uid>` and read the raw counts: total,
   confirmed vs. cancelled vs. still pending, and the date range.
2. `npm run review-queue` and work through every unresolved
   `pipelineLearningLog` entry (`kind: "flagged"`), oldest first: each one
   is either a trace the grader flagged that could not auto-promote (a
   cancellation, a plain confirm, or a failed reconstruction), stated
   plainly in its own summary. Decide, per entry, whether it should still
   teach the model something. `--resolve <logId>` alone marks it looked
   at and done; `--resolve <logId> --promote` (with either
   `--use-live-response` or a hand-corrected `--expected-file`, the exact
   convention `scripts/promote-trace.mjs` already uses) promotes it into
   `referenceExamples` by hand, `source: "manual"`, the same validation
   gate the automatic path runs.
3. Review every cancelled trace next (the tool's own sort order): a
   rejected proposal is the highest-signal case, the model got something
   wrong that mattered enough to reject outright.
4. Review confirmed traces next, field by field against the transcript
   (decision, sections, priorities, due dates, confidence), never assumed
   correct because a person clicked Confirm. **This is not optional
   diligence**: the 2026-07-08 "First real review of the Structure trace
   collection" resolution-log entry found the very first confirmed trace
   ever reviewed had an inverted priority on two tasks, exactly the bug that
   had already shipped once under the assumption that "confirmed" meant
   "correct."
5. Promote 1 to 3 fixtures that add real, new coverage (a different
   transcript style, a routing case, a genuinely ambiguous one, a
   multilingual one), not an exhaustive promotion of everything found.
   Quality of coverage over quantity.
6. `npm run sync-learnings`, once every entry worth keeping has a decision
   (an auto-promotion needs none, a flagged entry needs `resolved: true`
   from step 2): mirrors every eligible `pipelineLearningLog` entry into
   `docs/pipeline-learnings.md` as a short, dated line and marks it
   mirrored, so the next run only appends what is new. This is the one
   step that turns the database log into the committed file; nothing else
   in this flywheel writes to that file directly.
7. Cross-check `users/{uid}/llmUsage`'s request count against
   `structureTraces`'s document count for the same day. A mismatch means
   the fallback-write path (`docs/architecture.md`, `traceWriteFailed`) is
   firing, real calls are happening with degraded or zero trace capture,
   and that needs its own investigation, not a silent shrug. This exact
   mismatch is how the 2026-07-08 review found the gap the fallback path
   now guards against.
8. Report actual spend (`users/{uid}/llmUsage`, summed across every dated
   document) against `DAILY_COST_LIMIT_USD`. Do not use
   `npm run trace:summary` for this: that script only ever reads local
   `llm-traces/`, populated only by local live-eval runs, never production
   usage.
9. Flag, do not fix in the same pass, any failure mode that isn't already
   tracked in `docs/resolution-log.md`. A review pass finds problems; a
   separate, scoped pass fixes them, each with its own resolution-log entry.
   This includes the grader itself: a verdict that looks wrong on a manual
   read is exactly the kind of thing this step exists to catch, the same
   "spot-check, don't trust blindly" posture "Automatic grading" above
   already states.
