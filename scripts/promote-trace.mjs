// Promotes a real structureTrace into an offline regression fixture, shaped
// exactly like evals/fixtures/*.json. Two paths:
//
//   --use-live-response    only when the trace's own outcome is "confirmed",
//                          since a person actually endorsed that response.
//   --expected-file <path>  a hand-written { mockResponse: {...} } JSON file,
//                          the corrected response a human decided the model
//                          should have produced. Required for a cancelled (or
//                          still-pending) trace: what the model actually did
//                          there was not endorsed by anyone, so it cannot
//                          become an auto-trusted fixture.
//
// Refuses to write a fixture whose mockResponse fails validateStructure or
// the grounding guard; promoting a trace is a source of real cases for the
// contract, not a way around it. See docs/llm-pipeline.md.
//
// Existing projects on the trace are ids only (existingProjectIds), never
// names, so a promoted fixture always ships with existingProjects: []. A
// fixture that needs a real routing target (by name) still needs hand-
// editing after promotion; known limitation, not fixed here.
//
// Run:
//   npm run traces:promote -- --uid <uid> --id <traceId> --fixture-id <slug> \
//     --describe "one line" --use-live-response
//   npm run traces:promote -- --uid <uid> --id <traceId> --fixture-id <slug> \
//     --describe "one line" --expected-file ./correction.json

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';
import { validateStructure, ungroundedContents, allContents } from '../src/pipeline/contracts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'evals', 'fixtures');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = value;
      if (value !== true) i += 1;
    }
  }
  return args;
}

const USAGE =
  'Usage: npm run traces:promote -- --uid <uid> --id <traceId> --fixture-id <slug> ' +
  '--describe "one line" (--use-live-response | --expected-file <path>)';

const args = parseArgs(process.argv.slice(2));
const required = ['uid', 'id', 'fixture-id', 'describe'];
const missingRequired = required.filter((k) => !args[k]);
const hasLive = Boolean(args['use-live-response']);
const hasExpectedFile = Boolean(args['expected-file']);

if (missingRequired.length || (!hasLive && !hasExpectedFile)) {
  console.error(USAGE);
  process.exit(1);
}
if (hasLive && hasExpectedFile) {
  console.error('Pass exactly one of --use-live-response or --expected-file, not both.');
  process.exit(1);
}

function deriveExpected(mockResponse) {
  const minSubtasks = (mockResponse.tasks || []).reduce((n, t) => n + (t.subtasks?.length || 0), 0);
  const priorities = {};
  const due = {};
  for (const t of mockResponse.tasks || []) {
    if (t && typeof t.content === 'string') {
      priorities[t.content] = t.priority;
      due[t.content] = t.due ?? null;
    }
    for (const s of t?.subtasks || []) {
      if (s && typeof s.content === 'string') {
        priorities[s.content] = s.priority;
        due[s.content] = s.due ?? null;
      }
    }
  }
  return {
    decision: mockResponse.decision,
    hasProject: Boolean(mockResponse.project),
    targetProjectId: mockResponse.targetProjectId ?? null,
    needsClarification: mockResponse.needsClarification,
    minSubtasks,
    contents: allContents(mockResponse),
    priorities,
    due
  };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'super-ramble' });
  const db = admin.firestore();

  const snap = await db.doc(`users/${args.uid}/structureTraces/${args.id}`).get();
  if (!snap.exists) {
    console.error(`No trace ${args.id} found for ${args.uid}.`);
    process.exit(1);
  }
  const trace = snap.data();

  if (trace.traceWriteFailed) {
    console.error(
      `Trace ${args.id} is a write-failure marker (the real trace write itself failed; ` +
        `errorCode: ${trace.errorCode ?? '(none)'}, errorMessage: ${trace.errorMessage ?? '(none)'}), ` +
        'not a real Structure call. There is no transcript or response to promote.'
    );
    process.exit(1);
  }

  let mockResponse;
  if (hasLive) {
    if (trace.outcome !== 'confirmed') {
      console.error(
        `Refusing --use-live-response: trace ${args.id}'s outcome is "${trace.outcome}", not "confirmed". ` +
          'A cancelled or still-pending trace was not endorsed by anyone; use --expected-file with a hand-written correction instead.'
      );
      process.exit(1);
    }
    if (!trace.response) {
      console.error(`Trace ${args.id} has no parsed response to promote (ok: ${trace.ok}).`);
      process.exit(1);
    }
    mockResponse = trace.response;
  } else {
    const raw = JSON.parse(await readFile(args['expected-file'], 'utf8'));
    if (!raw.mockResponse) {
      console.error(`${args['expected-file']} must contain a top-level "mockResponse" object.`);
      process.exit(1);
    }
    mockResponse = raw.mockResponse;
  }

  const fixture = {
    id: args['fixture-id'],
    describe: args.describe,
    transcript: trace.transcript,
    existingProjects: [],
    mockResponse,
    expected: deriveExpected(mockResponse)
  };

  const { valid, errors } = validateStructure(fixture.mockResponse, { existingProjectIds: [] });
  const ungrounded = valid ? ungroundedContents(fixture.mockResponse, fixture.transcript) : [];
  if (!valid || ungrounded.length) {
    console.error(`Refusing to write ${args['fixture-id']}.json, this response does not pass the contract:`);
    for (const e of errors) console.error(`  - ${e}`);
    for (const c of ungrounded) console.error(`  - invented content not in the transcript: ${c}`);
    process.exit(1);
  }

  const outPath = join(fixturesDir, `${args['fixture-id']}.json`);
  await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
  console.log('Run npm run eval and hand-review the file before committing.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
