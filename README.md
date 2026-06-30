# super-ramble

Voice brain-dump in, structured projects out. The organize step after capture.

Todoist's Ramble captures a stream into flat tasks and routes them into existing
projects. It does not synthesize new project structure and it does not nest
sub-tasks. super-ramble is the organize step right after capture. It reads a
transcript plus your existing Todoist projects, decides whether the content is
loose tasks or a project with sub-tasks, proposes a scaffold with one-line
reasoning, and on your confirm writes the project-with-nested-tasks to Todoist.

Nothing is written without an explicit confirm. You stay in control.

The novel work is the structure synthesis, not the voice pipeline. Capture is a
thin record-then-transcribe adapter. Structuring is the core.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the Firebase web config values
npm run dev                  # serves the placeholder on http://localhost:5173
```

Set `VITE_ENABLE_LOCAL_PREVIEW=true` in `.env.local` to see the page without auth.

## Run the evals (the default no-credit check)

```bash
npm run eval                 # alias of eval:offline
```

Offline evals run the real structuring pipeline against synthetic fixtures using
mocked model responses. They never call the model and spend no credits. They
assert the JSON contract end to end and write `evals/runs/latest.json`.

Live evals are gated and bounded, and need the dev server running:

```bash
EVAL_ALLOW_LIVE=true npm run eval:live
EVAL_ALLOW_LIVE=true EVAL_MAX_CASES=2 npm run eval:live
EVAL_ALLOW_LIVE=true EVAL_CASE_IDS=01-clear-single-project npm run eval:live
```

## Watch spend

```bash
npm run trace:summary
```

Every local live call writes a raw trace under `llm-traces/` (gitignored). The
summary reports total cost, per-step token and cost breakdown, failures, and a
budget block against `LLM_SPEND_CEILING_USD` (default 50). Empty is fine before
your first live call.

## Privacy

Personal free text (transcripts, task contents, project names) is encrypted
client-side with AES-GCM before any Firestore write. No secret key reaches the
browser. The browser calls same-origin `/api/**`. The Function verifies Firebase
Auth, reads the Anthropic key and Todoist client secret from Function secrets,
and proxies the model and Todoist calls.

Production stores only privacy-safe usage per user per day at
`users/{uid}/llmUsage/{YYYY-MM-DD}`. Raw prompts and responses are off by default
(`LLM_STORE_RAW_TRACES=false`) and are a local debugging tool only. Firestore
rules scope every document to its owner.

## Deploy

Requires the Firebase project secrets and your `.env.local`. Do not deploy
without them.

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set TODOIST_CLIENT_SECRET
npm run build
firebase deploy
```

Hosting serves `dist/`, rewrites `/api/**` to the `api` Function, and SPA-rewrites
the rest. The placeholder publishes to https://super-ramble.web.app.

## CI

On every push and pull request, `.github/workflows/ci.yml` runs `npm ci`,
`npm run build`, `npm run eval:offline`, and a syntax check on the Function.
Green before anything else.

## Where the truth lives

`docs/` is the single source of truth. Start with
[docs/orchestration.md](docs/orchestration.md), then read the rest of the set.
Root tool files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`) only point there.
