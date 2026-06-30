# Roadmap

## Built (this skeleton)

- Repo structure and the full `docs/` source-of-truth set.
- Firebase wired: Auth, Firestore, Hosting, Functions, config from env with a
  missing-config guard.
- Auth-gate seam and a single calm, deployable placeholder page.
- The structuring pipeline boundary: contract, strict validator, prompt builder,
  and an injected `callModel` so one path serves offline, local live, and prod.
- Offline eval harness with six synthetic fixtures and negative contract cases.
  No credits. Writes `evals/runs/latest.json`.
- Local trace capture and `npm run trace:summary` with a budget block.
- The `/api` Function stub: real auth, real per-user daily limits, real usage
  logging; model and Todoist calls stubbed to contract-shaped fixtures.
- CI: build, offline evals, and a Function syntax check.

## Next

- The real structuring prompt and contract, tuned against live evals.
- Todoist OAuth flow and the real project read and batched write.
- The propose-confirm-write UI.
- Design tokens derived from screenshots of the live Todoist Ramble flow.
- Live evals once the contract is stable.
- Voice capture (record then transcribe) as a thin input adapter.

## Out of scope

- Live-streaming voice. Ramble already owns that. Do not compete on it.
- Auto-execution of tasks. The user always confirms before any write.
- Any feature that decides or does the work rather than structuring it.
