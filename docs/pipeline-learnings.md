# Pipeline learnings

Distinct from [docs/resolution-log.md](resolution-log.md), which logs
everything (every fix, every deploy, every doc update, append-only). This
file only ever holds one kind of thing: a real finding from a real trace,
what was wrong, and what changed because of it. Short, dated entries. If a
pass didn't come from reading real production data, it doesn't belong here,
even if it's a genuine improvement; log that in `docs/resolution-log.md`
instead.

## How to add an entry

1. `npm run traces:grade -- --uid <uid>` first, so the automatic flags
   (`judgeCompleteness`/`judgeCorrectness`) narrow what's worth reading
   before you read anything by hand. It only flags; it never picks the fix
   for you.
2. `npm run traces:list -- --uid <uid>` against a real uid. Cancelled and
   confirmed-with-edits traces sort first, the highest-signal cases; a
   flagged trace from step 1 is worth a look too, but its verdict still
   needs a real read, not a rubber stamp (`docs/llm-pipeline.md`).
3. Pick one trace worth a permanent fix, not every trace with a rough edge.
   Quality of finding over quantity, the same discipline the eval-flywheel
   review cadence already uses for fixture promotion.
4. Decide what kind of fix it needs: a prompt edit
   (`src/pipeline/prompt.js`, mirrored into `functions/index.js`), a new or
   corrected reference example (`src/pipeline/referenceExamples.js`,
   mirrored into `functions/referenceExamples.js`), a new
   `evals/fixtures/*.json` entry, or some combination. Not every finding
   needs all three; state which ones this entry actually needs and why.
5. Write one dated entry below: the real evidence (which trace, what the
   transcript said, what the response got wrong), the fix, and what was
   verified. Then hand that entry to an agent as the fix's spec, the same
   way this repo's own tasks get handed off: the entry states the finding
   and the intended fix, the agent implements and verifies it.

---

## 2026-07-13: "Important" lands softer than "urgent," despite the prompt already saying they should match

**Finding.** Two independent real data points, both showing the exact same
failure mode: a task the speaker calls "important" lands at a lower
priority number than the transcript's own wording justified, even though
`SYSTEM_PROMPT` already listed "important" alongside "urgent" as a word
that should map toward priority 1.

- The Big Sur camping trip trace (`docs/resolution-log.md`, 2026-07-08):
  "Pack first aid kit... that one's important" landed priority 3. Noted at
  the time, deliberately not corrected in the promoted fixture, since that
  review had no second data point yet and didn't want to bake in an
  unverified number.
- Today's live moving-apartment trace (trace `ynQakgn1DZnrS7ADSVn6`, uid
  `ZGjRHCpURTeWKD2fll6lKKHezD43`, confirmed outcome): "Also need to buy
  renters insurance for the new place before we move in, that one's
  important" landed priority 2. Meanwhile the same response correctly gave
  priority 1 to two tasks the transcript called "urgent" in the same
  breath (the electric company transfer, the moving truck). The model
  treats "important" and "urgent" as different strengths; the prompt says
  they should not be.

That is a real pattern, not one noisy trace: `SYSTEM_PROMPT`'s existing
line said to map "important" toward 1 but never said it carries the *same
weight* as "urgent," so the model had room to read it as a gentler nudge,
consistent with how "important" reads softer than "urgent" in everyday
English. That gap, not a one-off model mistake, is the actual bug.

**Fix.**

- `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` (and its hand-synced mirror,
  `functions/index.js`'s `STRUCTURE_SYSTEM_PROMPT_RULES`) gained one
  explicit sentence closing the gap: *"Important" carries the same weight
  as "urgent," not a softer one: a task the speaker calls out as important
  gets priority 1 too, not quietly downgraded to 2 or 3 just because the
  word itself reads gentler than "urgent" in everyday English.* Verified
  identical in both copies via `scripts/check-prompt-sync.mjs`.
- `evals/fixtures/11-important-language-priority.json` (new): the real
  moving-apartment trace, hand-corrected on exactly the one field this
  finding is about (renters insurance: priority 2 -> 1), every other field
  carried through unchanged from the real response, the same "correct only
  the verified field, don't touch what wasn't checked" discipline the Big
  Sur promotion used. Verified the assertion actually catches the bug it
  exists to catch, not just written and trusted: temporarily reverted the
  fixture's `mockResponse` to the real, buggy value (priority 2), ran
  `npm run eval:offline`, got a clean failure naming the exact mismatch
  (`priorities match: Buy renters insurance for the new place: expected 1,
  got 2`); restored the corrected value, reran clean.
- **A fifth reference example was not added. The existing four needed a
  correction instead, which mattered more.** `src/pipeline/referenceExamples.js`'s
  Big Sur example (copied from the real, promoted trace) still showed
  "Pack first aid kit" at priority 3, its own uncorrected value from the
  2026-07-08 review. Left as-is, that worked example would have kept
  contradicting the newly tightened prompt line the moment it shipped: a
  live few-shot example showing "important" -> 3 sitting right next to a
  rule insisting "important" -> 1 is a direct, self-defeating
  contradiction, not a harmless gap. Corrected to priority 1 in both
  hand-synced copies (`src/pipeline/referenceExamples.js` and
  `functions/referenceExamples.js`); `evals/fixtures/08-big-sur-camping-trip.json`
  itself is untouched; only the separate copy of that response used to
  teach the live model changed. Four examples, now internally consistent
  with the rule they sit beside, are the right amount of coverage for this
  finding; a fifth would not add a new failure mode this one doesn't
  already touch.

**What this does not prove.** Offline evals never call the real model, mocked
or not: `npm run eval` proves the new fixture's assertion works and both
prompt copies stay in sync, not that the live model actually structures
"important" language correctly now. That needs a real live call, spot-checked
by hand, per this repo's own established discipline for prompt changes (see
the resolution log's dated entry for this same pass, and the 2026-07-06
entry for why a real authenticated call was not spent here without standing
authorization).
