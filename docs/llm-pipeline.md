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
- Runs on Claude Sonnet, temperature 0. A deliberate, named exception to every
  other model call's Haiku default: docs/brief.md's "the structure has to be
  genuinely good" constraint makes structuring quality worth the extra cost.
  Every other call in this app stays on Haiku. See the resolution log entry
  dated 2026-07-06 for the model id and the cost math behind the daily limits.

### Reference examples

The real Structure call sees more than written rules. `src/pipeline/referenceExamples.js`
exports a small, curated array (four entries) of `{ transcript, response }`
pairs, hand-picked from `evals/fixtures/` for real variety: a clean single
project with nested sub-tasks, a real multi-section trip (the priority-
corrected version of the camping-trip trace, not the raw buggy one), a
restraint case that stays loose tasks instead of becoming a project, and a
case where sections earn their keep. `formatReferenceExamples` turns that
array into a labeled `PAST REFERENCE EXAMPLES` block, appended to
`SYSTEM_PROMPT` below the written rules. The block states plainly that these
are historical reference material, not the current user's transcript, so the
model does not confuse them with live input; this matters for
`isGroundedInTranscript` too (`src/pipeline/contracts.js`), which only ever
checks a response's content against the real transcript argument passed to
`structureTranscript`, never against this block.

This is separate from `evals/fixtures/`, which still exists and still does
its own job: fixtures run through the offline harness (`npm run eval`) with
a mocked `callModel`, testing the pipeline's own plumbing (contract
validation, grounding, the retry path), never a real model call. Reference
examples exist to teach the live model; fixtures exist to test the code
around it. A fixture can graduate into a reference example (as three of the
four here did) but the two collections serve different purposes and neither
substitutes for the other.

To edit: swap or update an entry in `src/pipeline/referenceExamples.js`,
then copy the identical change into `functions/referenceExamples.js`
(Firebase Functions deploys only the `functions/` directory and cannot
import `src/pipeline`, the same constraint `SYSTEM_PROMPT` itself already
has, docs/resolution-log.md, 2026-07-06). `scripts/check-prompt-sync.mjs`
diffs both `SYSTEM_PROMPT` strings and both `REFERENCE_EXAMPLES` arrays and
fails loudly on drift; it runs in `npm run eval` and as its own `ci.yml`
step, so an edit to only one copy fails CI instead of drifting silently
until a live incident, the same failure mode that already shipped once with
the priority-direction bug (docs/resolution-log.md, 2026-07-08).

Offline evals cannot prove this changed real model behavior; they never call
the real model, mocked or not. What CI actually verifies is that the
formatting function produces non-empty, well-formed text, that the block is
really appended to `SYSTEM_PROMPT`, and that both hand-synced copies match.
Whether the live model structures better with these examples in context is a
live-call question, spot-checked by hand (`EVAL_ALLOW_LIVE=true npm run
eval:live` or a real `/api/structure` call), not asserted in CI.

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
(`docs/architecture.md`), including the user's own confirmed or cancelled
decision: `POST /api/structure/outcome` records it right when Confirm or
Cancel is clicked in the preview. `npm run traces:list -- --uid <uid>`
reviews the most recent traces, cancellations first, since a proposal the
user rejected outright is the highest-signal case, the model got something
wrong that mattered, not just a detail worth an edit. `npm run traces:promote`
turns a reviewed trace into a new offline fixture, shaped exactly like
`evals/fixtures/*.json`. A confirmed trace promotes as-is
(`--use-live-response`): a person already looked at that exact tree and
accepted it. A cancelled trace needs a hand-written correction
(`--expected-file`): what the model produced there is precisely what nobody
wanted, so it cannot become an auto-trusted regression fixture. Every
promoted fixture still has to pass `validateStructure` and the grounding
guard before it can be written; promoting a trace is not a way around the
contract, only a source of real cases for it.

The preview a user reviews is read-only end to end (`TaskRow`'s `readOnly`
prop, `SuperRambleModal.jsx`); there is no way to edit the proposed tree
before confirming. That makes the outcome exactly two states, confirmed or
cancelled, not three. A future pass that lets a user adjust the tree before
confirming would add "confirmed with edits" as a real third state, and the
trace schema, the promotion script, and this paragraph would all need to
grow with it. That is a distinct, future decision, not something this pass
approximates.

### Automatic grading

`npm run traces:grade -- --uid <uid>` (`scripts/grade-traces.mjs`) is a
cheap, automatic first pass over ungraded traces, so nobody has to read a
growing collection blind before the review cadence below even starts. It
finds `structureTraces` documents with no `judgedAt` field yet and, for
each, makes one call on this app's default Haiku model, never Sonnet: the
grader must never touch the same model or cost tier as the real structuring
call it is checking. The judge compares a trace's own `transcript` against
its own `response` and returns two simple verdicts, `"ok"` or `"flag"`,
each with a one-line reason: whether anything the transcript mentioned
seems to be missing from the response, and whether priority or due dates
look defensible given the transcript's own wording. It writes
`judgeCompleteness`, `judgeCorrectness`, `judgeNotes`, and `judgedAt` back
onto the trace as a merge write, `transcript` and `response` untouched.
`npm run traces:list` shows the judge fields when present, flagged traces
marked plainly, so a listing immediately surfaces what needs a look.
Bounded by `LLM_SPEND_CEILING_USD`, the same local spend-ceiling convention
`scripts/trace-summary.mjs` already uses, so a big batch run can't run away
on cost by accident; `--limit` additionally caps how many ungraded traces
one run grades.

**This grader only flags. It never edits `src/pipeline/prompt.js` and never
writes an eval fixture itself.** Whether a flagged (or unflagged) trace is
worth a prompt change, or worth promoting into `evals/fixtures/*.json`
(`npm run traces:promote`), stays a human decision, exactly as it is today;
the grader narrows what a human has to read, it does not replace the
reading. Its own judgment is not infallible either, and should not be
trusted blindly: spot-check its verdicts against a real manual read on the
same review cadence below, the same "confirmed does not mean correct"
lesson that already applied once to a user's own Confirm click before this
grader existed (a confirmed trace with an inverted priority on two tasks,
`docs/resolution-log.md`, 2026-07-08). A grader that flags things wrong
often enough, or misses things a manual read catches, is itself a finding
worth a resolution-log entry, the same as any other failure mode this
flywheel surfaces.

### Review cadence

Review real traces at least monthly, or after every 10 new traces,
whichever comes first; this is a low-volume, single-dogfooding-user app
today, so a fixed cadence catches drift without turning into busywork
against near-empty data. Each review:

1. `npm run traces:list -- --uid <uid>` and read the raw counts: total,
   confirmed vs. cancelled vs. still pending, and the date range.
2. Review every cancelled trace first (the tool's own sort order): a
   rejected proposal is the highest-signal case, the model got something
   wrong that mattered enough to reject outright.
3. Review confirmed traces next, field by field against the transcript
   (decision, sections, priorities, due dates, confidence), never assumed
   correct because a person clicked Confirm. **This is not optional
   diligence**: the 2026-07-08 "First real review of the Structure trace
   collection" resolution-log entry found the very first confirmed trace
   ever reviewed had an inverted priority on two tasks, exactly the bug that
   had already shipped once under the assumption that "confirmed" meant
   "correct."
4. Promote 1 to 3 fixtures that add real, new coverage (a different
   transcript style, a routing case, a genuinely ambiguous one, a
   multilingual one), not an exhaustive promotion of everything found.
   Quality of coverage over quantity.
5. Cross-check `users/{uid}/llmUsage`'s request count against
   `structureTraces`'s document count for the same day. A mismatch means
   the fallback-write path (`docs/architecture.md`, `traceWriteFailed`) is
   firing, real calls are happening with degraded or zero trace capture,
   and that needs its own investigation, not a silent shrug. This exact
   mismatch is how the 2026-07-08 review found the gap the fallback path
   now guards against.
6. Report actual spend (`users/{uid}/llmUsage`, summed across every dated
   document) against `DAILY_COST_LIMIT_USD`. Do not use
   `npm run trace:summary` for this: that script only ever reads local
   `llm-traces/`, populated only by local live-eval runs, never production
   usage.
7. Flag, do not fix in the same pass, any failure mode that isn't already
   tracked in `docs/resolution-log.md`. A review pass finds problems; a
   separate, scoped pass fixes them, each with its own resolution-log entry.
