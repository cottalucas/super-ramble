// Offline eval harness. The default no-credit check.
//
// Runs the real structuring pipeline against synthetic fixtures using mocked
// model responses. Never calls the model, spends no credits. Asserts the JSON
// contract end to end, plus negative contract cases. Writes a machine-readable
// result to evals/runs/latest.json and exits non-zero on any failure.
//
// Run: npm run eval  (alias of npm run eval:offline)

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { structureTranscript, ContractError } from '../src/pipeline/structure.js';
import { validateStructure, allContents } from '../src/pipeline/contracts.js';
import { negativeCases } from '../evals/offline/contract-cases.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'evals', 'fixtures');
const runsDir = join(root, 'evals', 'runs');

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// No-invention guard: every produced content must be grounded in the transcript.
// A content is grounded if any meaningful token (4+ chars) appears in it.
function groundedInTranscript(content, transcript) {
  const t = normalize(transcript);
  const tokens = normalize(content)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  if (tokens.length === 0) return true; // very short content, skip
  return tokens.some((w) => t.includes(w));
}

const results = [];
let passed = 0;
let failed = 0;

function record(id, describe, checks) {
  const failures = checks.filter((c) => !c.ok);
  const ok = failures.length === 0;
  if (ok) passed += 1;
  else failed += 1;
  results.push({ id, describe, ok, checks });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${id}  ${describe}`);
  for (const f of failures) console.log(`        - ${f.label}: ${f.detail || ''}`);
}

function check(label, ok, detail) {
  return { label, ok: Boolean(ok), detail };
}

async function runFixtures() {
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const fx = JSON.parse(await readFile(join(fixturesDir, file), 'utf8'));
    const checks = [];
    let out = null;
    try {
      out = await structureTranscript({
        transcript: fx.transcript,
        existingProjects: fx.existingProjects || [],
        callModel: async () => fx.mockResponse
      });
      checks.push(check('contract valid', true));
    } catch (err) {
      const detail = err instanceof ContractError ? err.errors.join('; ') : err.message;
      checks.push(check('contract valid', false, detail));
      record(fx.id, fx.describe, checks);
      continue;
    }

    const exp = fx.expected;
    checks.push(check('reasoning present', out.reasoning && out.reasoning.trim().length > 0));
    checks.push(check('decision matches', out.decision === exp.decision, `got ${out.decision}`));
    checks.push(check('project presence matches', Boolean(out.project) === exp.hasProject));

    if ('targetProjectId' in exp) {
      checks.push(
        check(
          'routing target matches',
          (out.targetProjectId ?? null) === (exp.targetProjectId ?? null),
          `got ${out.targetProjectId}`
        )
      );
    }
    checks.push(
      check('clarification flag matches', out.needsClarification === exp.needsClarification)
    );

    const subtaskCount = (out.tasks || []).reduce((n, t) => n + (t.subtasks?.length || 0), 0);
    if (typeof exp.minSubtasks === 'number') {
      checks.push(
        check('subtasks nested', subtaskCount >= exp.minSubtasks, `got ${subtaskCount}`)
      );
    }

    const produced = allContents(out);
    const expectedSet = new Set(exp.contents || []);
    const extras = produced.filter((c) => !expectedSet.has(c));
    checks.push(check('no extra/invented content', extras.length === 0, extras.join(', ')));
    const missing = (exp.contents || []).filter((c) => !produced.includes(c));
    checks.push(check('no missing content', missing.length === 0, missing.join(', ')));

    const ungrounded = produced.filter((c) => !groundedInTranscript(c, fx.transcript));
    checks.push(
      check('all content grounded in transcript', ungrounded.length === 0, ungrounded.join(', '))
    );

    record(fx.id, fx.describe, checks);
  }
}

function runNegativeCases() {
  for (const c of negativeCases) {
    const { valid } = validateStructure(c.response, { existingProjectIds: c.existingProjectIds });
    // Negative cases must be rejected by the validator.
    record(c.id, c.describe, [check('rejected by validator', valid === false)]);
  }
}

async function main() {
  console.log('super-ramble offline evals (no credits)\n');
  await runFixtures();
  console.log('');
  runNegativeCases();

  const summary = {
    kind: 'offline',
    ranAt: new Date().toISOString(),
    total: passed + failed,
    passed,
    failed,
    results
  };

  await mkdir(runsDir, { recursive: true });
  await writeFile(join(runsDir, 'latest.json'), JSON.stringify(summary, null, 2));

  console.log(`\n${passed}/${passed + failed} passed. Wrote evals/runs/latest.json`);
  if (failed > 0) {
    console.error(`\n${failed} case(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
