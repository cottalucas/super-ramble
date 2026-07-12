// Live eval harness. Runs the same fixture cases against the real Function or
// the Vite dev bridge, so it spends credits. Gated and bounded so a stray run
// cannot burn the budget.
//
// Requires:
//   EVAL_ALLOW_LIVE=true        explicit opt-in, or this refuses to run
//   the dev server running       (the bridge the browser would use)
// Bounds:
//   EVAL_MAX_CASES=<n>          cap the number of cases (default 3)
//   EVAL_CASE_IDS=a,b,c         run only these fixture ids
//
// Run: EVAL_ALLOW_LIVE=true npm run eval:live

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { structureTranscript, ContractError } from '../src/pipeline/structure.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'evals', 'fixtures');

const BRIDGE_URL = process.env.EVAL_BRIDGE_URL || 'http://localhost:5173/api/structure';

if (process.env.EVAL_ALLOW_LIVE !== 'true') {
  console.error('Live evals are gated. Set EVAL_ALLOW_LIVE=true to run them.');
  console.error('These spend credits. The default no-credit check is: npm run eval');
  process.exit(1);
}

const maxCases = Number(process.env.EVAL_MAX_CASES || 3);
const onlyIds = (process.env.EVAL_CASE_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Live callModel: hit the same /api/structure endpoint the browser uses.
// The Anthropic key stays server-side; this never sees it. priorErrors is
// forwarded so structureTranscript's one corrective retry (src/pipeline/
// structure.js) actually reaches the model on a live run, not just locally.
async function callModelLive({ transcript, existingProjects, priorErrors }) {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript, existingProjects, priorErrors: priorErrors || null })
  });
  if (!res.ok) throw new Error(`bridge responded ${res.status}`);
  return (await res.json()).structured;
}

async function main() {
  let files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json')).sort();
  let fixtures = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(fixturesDir, f), 'utf8')))
  );
  if (onlyIds.length) fixtures = fixtures.filter((fx) => onlyIds.includes(fx.id));
  fixtures = fixtures.slice(0, maxCases);

  console.log(`super-ramble live evals against ${BRIDGE_URL}`);
  console.log(`running ${fixtures.length} case(s) (max ${maxCases})\n`);

  let passed = 0;
  for (const fx of fixtures) {
    try {
      const out = await structureTranscript({
        transcript: fx.transcript,
        existingProjects: fx.existingProjects || [],
        callModel: callModelLive
      });
      console.log(`PASS  ${fx.id}  decision=${out.decision}`);
      passed += 1;
    } catch (err) {
      const detail = err instanceof ContractError ? err.errors.join('; ') : err.message;
      console.log(`FAIL  ${fx.id}  ${detail}`);
    }
  }

  console.log(`\n${passed}/${fixtures.length} passed. Run npm run trace:summary to see spend.`);
  if (passed !== fixtures.length) process.exit(1);
}

main().catch((err) => {
  console.error('Live eval could not run. Is the dev server up?');
  console.error(err.message);
  process.exit(1);
});
