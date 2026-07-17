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
import { guardCases } from '../evals/offline/guard-cases.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'evals', 'fixtures');
const runsDir = join(root, 'evals', 'runs');

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

/** Map a structuring response's task/subtask content to its priority and due, for
 * asserting per-fixture values a schema range-check cannot: the direction a
 * priority number encodes relative to the transcript's own stated urgency. */
function fieldsByContent(obj) {
  const map = new Map();
  for (const t of obj.tasks || []) {
    // A subtask never carries its own standalone field in the contract
    // (docs/llm-pipeline.md, Stage 2); it inherits its parent root task's
    // value, the same way src/pipeline/write.js's flattenTasks carries it
    // onto a standalone task's own subtasks.
    if (t && typeof t.content === 'string') {
      map.set(t.content, { priority: t.priority, due: t.due ?? null, standalone: Boolean(t.standalone) });
    }
    for (const s of t?.subtasks || []) {
      if (s && typeof s.content === 'string') {
        map.set(s.content, { priority: s.priority, due: s.due ?? null, standalone: Boolean(t?.standalone) });
      }
    }
  }
  return map;
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

    if ('priorities' in exp) {
      const fields = fieldsByContent(out);
      const mismatches = Object.entries(exp.priorities)
        .filter(([content, p]) => fields.get(content)?.priority !== p)
        .map(([content, p]) => `${content}: expected ${p}, got ${fields.get(content)?.priority}`);
      checks.push(check('priorities match', mismatches.length === 0, mismatches.join('; ')));
    }

    if ('due' in exp) {
      const fields = fieldsByContent(out);
      const mismatches = Object.entries(exp.due)
        .filter(([content, d]) => (fields.get(content)?.due ?? null) !== (d ?? null))
        .map(([content, d]) => `${content}: expected ${JSON.stringify(d)}, got ${JSON.stringify(fields.get(content)?.due)}`);
      checks.push(check('due matches', mismatches.length === 0, mismatches.join('; ')));
    }

    // Every content string a fixture lists as standalone must actually carry
    // standalone: true in the real output, and nothing outside that list
    // should, the same symmetric extra/missing style the "contents" check
    // below already uses. See docs/llm-pipeline.md, Stage 2, and
    // src/pipeline/write.js's toProjectTree, which routes anything this
    // marks true into a second Inbox tree.
    if ('standaloneContents' in exp) {
      const fields = fieldsByContent(out);
      const expectedStandalone = new Set(exp.standaloneContents);
      const wronglyStandalone = Array.from(fields.entries())
        .filter(([content, f]) => f.standalone && !expectedStandalone.has(content))
        .map(([content]) => `extra: ${content}`);
      const missingStandalone = exp.standaloneContents
        .filter((c) => !fields.get(c)?.standalone)
        .map((c) => `missing: ${c}`);
      checks.push(
        check(
          'standalone routing matches',
          wronglyStandalone.length === 0 && missingStandalone.length === 0,
          [...wronglyStandalone, ...missingStandalone].join('; ')
        )
      );
    }

    // Calibrated confidence: docs/llm-pipeline.md's own eval assertions list
    // calls for high confidence on the clear-cut fixtures, low on the
    // genuinely ambiguous one. `confidenceAbove`/`confidenceBelow` are
    // deliberately not derived by scripts/promote-trace.mjs's
    // deriveExpected(): confidence is the model's own self-report, so
    // copying a promoted trace's confidence back as "expected" would be
    // circular, asserting only that the model agrees with itself. These two
    // fields are meant to be hand-set by whoever authors or reviews a
    // fixture, a real judgment call about what confidence a fixture's
    // transcript actually deserves, the same way the hand-corrected
    // `priorities`/`due` fields on a promoted fixture are.
    if (typeof exp.confidenceAbove === 'number') {
      checks.push(
        check(
          'confidence above threshold',
          typeof out.confidence === 'number' && out.confidence > exp.confidenceAbove,
          `expected > ${exp.confidenceAbove}, got ${out.confidence}`
        )
      );
    }
    if (typeof exp.confidenceBelow === 'number') {
      checks.push(
        check(
          'confidence below threshold',
          typeof out.confidence === 'number' && out.confidence < exp.confidenceBelow,
          `expected < ${exp.confidenceBelow}, got ${out.confidence}`
        )
      );
    }

    // A real live trace asked a user to choose between two same-named
    // projects by raw Firestore id, a question nobody can answer. This
    // catches that class of regression directly: a fixture lists every
    // substring (typically the ambiguous existingProjects' own ids) that
    // must never appear in the produced clarificationQuestion.
    if (Array.isArray(exp.clarificationExcludes)) {
      const q = out.clarificationQuestion || '';
      const leaked = exp.clarificationExcludes.filter((s) => q.includes(s));
      checks.push(
        check('clarificationQuestion has no leaked ids', leaked.length === 0, leaked.join(', '))
      );
    }

    const produced = allContents(out);
    const expectedSet = new Set(exp.contents || []);
    const extras = produced.filter((c) => !expectedSet.has(c));
    checks.push(check('no extra/invented content', extras.length === 0, extras.join(', ')));
    const missing = (exp.contents || []).filter((c) => !produced.includes(c));
    checks.push(check('no missing content', missing.length === 0, missing.join(', ')));

    // Grounding (no invented content) is now enforced inside structureTranscript
    // itself, the same guard a real live call gets, not just an eval-time check.
    // An ungrounded fixture would already have failed "contract valid" above,
    // so there is nothing left to check separately here.

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

async function runGuardCases() {
  for (const c of guardCases) {
    const checks = [];
    let callCount = 0;
    try {
      await structureTranscript({
        transcript: 'irrelevant for this guard',
        existingProjects: [],
        callModel: async () => {
          const raw = c.rawResponses[Math.min(callCount, c.rawResponses.length - 1)];
          callCount += 1;
          return raw;
        }
      });
      checks.push(check('threw ContractError', false, 'no error was thrown'));
    } catch (err) {
      checks.push(check('threw ContractError', err instanceof ContractError));
      const detail = err instanceof ContractError ? err.errors.join('; ') : err.message;
      checks.push(
        check('error mentions expected reason', detail.includes(c.expectErrorContains), detail)
      );
    }
    checks.push(
      check('retried the expected number of times', callCount === c.expectRetryCount, `got ${callCount}`)
    );
    record(c.id, c.describe, checks);
  }
}

async function main() {
  console.log('super-ramble offline evals (no credits)\n');
  await runFixtures();
  console.log('');
  runNegativeCases();
  console.log('');
  await runGuardCases();

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
