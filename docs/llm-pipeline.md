# LLM pipeline

The structuring pipeline is the core of super-ramble. It turns a transcript into
a proposed Todoist scaffold, with a one-line reason the user can read before
they confirm.

## Model

Claude Haiku, pinned via `ANTHROPIC_MODEL`. One model. There is no Sonnet or Opus
call path. The structuring task is bounded and benefits from a fast, cheap model
run well, not a bigger one.

## Input

- The transcript: the user's spoken brain-dump, transcribed.
- The user's existing Todoist project list, names and ids, for routing.

The project list is injected directly into the prompt. No RAG. This echoes how
Ramble injects projects and labels into context. The list is small and the cost
of injecting it is low, so retrieval adds complexity with no payoff here.

## Decision

The model picks one of two shapes and states why in one human-readable line that
the UI surfaces:

- `project`: the dump is one coherent effort. Synthesize a project with nested
  sub-tasks, or route into an existing project when the dump clearly belongs
  there.
- `tasks`: the dump is loose, unrelated items. Return flat tasks. Do not
  synthesize a project.

When the dump is genuinely ambiguous, the model sets `needsClarification` and
asks one short question instead of guessing a structure.

## Behavior

Temperature is 0. The model captures the dump literally and structures it. It
does not over-interpret, and it does not do the tasks it is organizing. It never
invents a task that is not in the transcript. It does not collapse unrelated
items into one mega-project.

## Output contract

Strict JSON. The shape lives in `src/pipeline/contracts.js` and is the single
source for both the prompt and the validator.

```json
{
  "decision": "project | tasks",
  "reasoning": "one human-readable line",
  "targetProjectId": "existing project id, or null",
  "project": { "name": "string" },
  "tasks": [
    {
      "content": "string",
      "priority": 1,
      "due": "string or null",
      "subtasks": [
        { "content": "string", "priority": 1, "due": "string or null" }
      ]
    }
  ],
  "needsClarification": false,
  "clarificationQuestion": "string or null"
}
```

Rules the validator enforces:

- `decision` is one of the two values.
- `reasoning` is present and non-empty.
- `targetProjectId` is null or one of the existing project ids passed in. Routing
  cannot target a project that does not exist.
- `project` is set when creating; null when routing into an existing project.
  `decision: tasks` must not carry a project.
- `priority` is an integer 1 to 4 (Todoist's range).
- `due` is a string or null.
- Sub-tasks nest under their parent task.
- `needsClarification: true` requires a `clarificationQuestion`.
- Any field outside the contract is rejected.

## Eval hooks

Every contract field is checked offline against synthetic fixtures, with mocked
model responses and no credits. The offline run asserts:

- The contract is valid end to end.
- The project/no-project decision matches the case.
- Sub-tasks are nested correctly.
- No task is invented that is not grounded in the transcript.
- Routing targets an existing project id when the dump matches one.
- The reasoning string is present and non-empty.
- Out-of-contract fields are rejected by the validator.

Fixtures live in `evals/fixtures/` and span: a clear single project with
sub-tasks, loose unrelated tasks, a dump that routes into an existing project, an
ambiguous case held for clarification, multilingual input, and a guard against
collapsing everything into one mega-project. Negative contract cases live in
`evals/offline/`.

Live evals run the same cases against the real Function or the Vite bridge. They
are gated behind `EVAL_ALLOW_LIVE=true` and bounded by `EVAL_MAX_CASES` and
`EVAL_CASE_IDS`. Local live calls write raw traces to `llm-traces/` for spend
review with `npm run trace:summary`.
