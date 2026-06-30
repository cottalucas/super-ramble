# LLM pipeline

The detailed contract for phase 3. It is written now so phase 2 builds the store
to fit it. The pipeline runs in four stages. Structure emits a tree shaped for
`store.createProjectTree`, which is why the task app is built first.

## Stage 1: Transcribe

Audio in, text out. Recorded then transcribed, not live-streamed. Text input is
a pass-through. This stage is out of scope to perfect early; the value is the
structuring, not the transcription.

- Contract: `{ audio | text }` in, `{ transcript }` out.

## Stage 2: Classify

Decides whether the dump is loose tasks or a structured project, and shows why.
Making the decision visible is a core product moment, so the reason is surfaced
in the UI.

- Input: `{ transcript, existingProjects, existingLabels }`.
- Output: `{ kind: "flat" | "project", reason: string, confidence: number }`.
- Runs on Claude Haiku.

## Stage 3: Structure

Runs only when `kind` is `"project"`. Produces the tree the store will write.

- Input: `{ transcript, existingProjects, existingLabels }`.
- Output:
  ```json
  {
    "project": { "name": "string", "color": "string" },
    "sections": [{ "name": "string" }],
    "tasks": [
      {
        "content": "string",
        "description": "string",
        "priority": 1,
        "due": "string",
        "labels": ["string"],
        "parentRef": "local ref or null",
        "sectionRef": "local ref or null"
      }
    ]
  }
  ```
- `parentRef` and `sectionRef` are local references, resolved into ids at write
  time by `store.createProjectTree`.
- Priorities map to 1 to 4. Dates are inferred from natural language and
  normalized.
- When the dump references an existing project, route into it instead of creating
  a new one.
- The output must validate against a JSON schema before it can reach Write.
- Runs on Haiku.

## Stage 4: Write

Runs only on explicit user confirm. Translates the validated tree into a
`store.createProjectTree` call, or the Todoist batched create later. Never writes
without confirmation. A pure function, no model call.

## Eval assertions per stage

Classify:
- Project-vs-flat accuracy on labeled fixtures.
- Calibrated confidence.
- A held set of genuinely ambiguous cases that should land `"flat"` with low
  confidence rather than inventing structure.

Structure:
- Schema-valid output.
- No orphan sub-tasks. Every `parentRef` resolves.
- Priorities in 1 to 4.
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

Haiku only. Offline evals use mocked responses and spend nothing. Live evals are
gated behind `EVAL_ALLOW_LIVE`. Every local live call writes a trace, and
`npm run trace:summary` watches spend against `LLM_SPEND_CEILING_USD`.
