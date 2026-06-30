# Resolution log

Append-only. Each entry is dated and records what was done and the decisions a
future agent should not relitigate.

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
