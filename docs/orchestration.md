# Orchestration

Every agent runs this loop before building. Claude Code, Cursor, Codex, and
humans all start here. The root tool files (`CLAUDE.md`, `AGENTS.md`,
`.cursorrules`) only point to this doc. The `docs/` set is the source of truth.

## The loop

1. Read first, in this order:
   - `docs/brief.md`
   - `docs/architecture.md`
   - `docs/design-system.md`
   - `docs/llm-pipeline.md`
   - `docs/roadmap.md`
   - `docs/resolution-log.md`
2. Challenge conflicts before building. If the task contradicts a doc, or two
   docs disagree, or reality (an API, a contract) does not match a doc, raise it
   and resolve it first. Do not build over a known conflict.
3. Build to the docs. Match the architecture, the contract, the design system,
   and the copy rules.
4. Verify before done. Run the checks below against the anti-pattern list in
   `docs/design-system.md`.
5. Update the docs. If the build changed a decision, a shape, or a flow, the docs
   change in the same pass.
6. Append a dated entry to `docs/resolution-log.md`: what was done and the
   decisions a future agent should not relitigate.

## Definition of done

- Builds clean. `npm run build` produces `dist/`.
- Offline evals pass. `npm run eval` is green and writes `evals/runs/latest.json`.
- Matches the design system, including the anti-pattern checklist.
- Reads as native Todoist against `docs/reference/`.
- The store interface shape is unchanged, unless the doc changed with it.
- Docs and the resolution log are updated in the same pass.
- Copy follows stop-slop. Active voice, no filler, varied rhythm, no em dashes,
  no hyphen as a connector.
- No secrets committed. `.env.example` carries placeholder names only. Keys are
  Function secrets.

## Tool-agnostic note

This loop does not depend on which agent runs it. The root tool files are
pointers, not truth. Read the `docs/` set, build to it, update it, log the
resolution.
