// Fails loudly if this app's hand-synced file pairs drift.
//
// Firebase Functions deploys only the functions/ directory as its own
// CommonJS package, so it cannot import the ESM modules under src/pipeline
// (docs/resolution-log.md, 2026-07-06). That forces two pairs of files to be
// kept identical by hand:
//   - src/pipeline/prompt.js's SYSTEM_PROMPT (the written rules only, as of
//     the Firestore-backed reference-examples pass: worked examples are
//     fetched from Firestore at request time now, not appended from a
//     second file, so this half is simpler than it used to be)
//     <-> functions/index.js's STRUCTURE_SYSTEM_PROMPT_RULES
//   - src/pipeline/contracts.js's validateStructure/isGroundedInTranscript/
//     ungroundedContents (needed by the auto-promotion trigger, which
//     cannot import src/pipeline either)
//     <-> functions/contracts.js's copies
// This exact "kept in sync by hand" duplication already caused a real bug
// once (the priority-direction fix, docs/resolution-log.md, 2026-07-08,
// caught only by a live trace, not by CI) and the reference-examples pair
// that used to be a third instance of it was retired only by moving that
// data out of source files entirely, not by getting more careful. This
// script is the guard so a future edit to one copy and not the other fails
// CI immediately instead of drifting silently until the next live incident.
//
// The two SYSTEM_PROMPT rule sets are compared as text, since the text
// itself is the artifact that has to match exactly, one wrong character and
// all. The two contracts.js copies are compared behaviorally instead: they
// are functions, not data, so a shared set of probe cases is run against
// both copies and their outputs compared, the same principle, applied the
// way it has to apply to code rather than a string.
//
// Neither src/pipeline/contracts.js nor functions/contracts.js has any
// external dependency (no firebase-admin, no @anthropic-ai/sdk), so both are
// safe to import/require directly regardless of whether functions/node_modules
// exists; STRUCTURE_SYSTEM_PROMPT_RULES is still extracted from
// functions/index.js's source text rather than requiring that module, since
// functions/index.js itself does need firebase-admin/firebase-functions/
// @anthropic-ai/sdk, only ever installed under functions/node_modules by its
// own `npm ci --prefix functions`, a step CI's root `npm ci` never runs (see
// this file's own git history for the exact CI failure that taught this).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYSTEM_PROMPT } from '../src/pipeline/prompt.js';
import * as srcContracts from '../src/pipeline/contracts.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Extract a top-level `const <name> = [ ... ];` array literal's source text and eval it in isolation. */
function extractArrayLiteral(source, constName, sourceLabel) {
  const marker = `const ${constName} = [`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Could not find "${marker}" in ${sourceLabel}`);
  }
  const openBracket = start + marker.length - 1;
  let depth = 0;
  let end = -1;
  for (let i = openBracket; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error(`Could not find the closing bracket for ${constName} in ${sourceLabel}`);
  }
  const literalText = source.slice(openBracket, end + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${literalText});`)();
}

const failures = [];

// --- SYSTEM_PROMPT rules text, byte for byte ---
const functionsIndexSource = readFileSync(join(root, 'functions', 'index.js'), 'utf8');
const fnRules = extractArrayLiteral(functionsIndexSource, 'STRUCTURE_SYSTEM_PROMPT_RULES', 'functions/index.js');
const fnSystemPrompt = fnRules.join('\n');

if (SYSTEM_PROMPT !== fnSystemPrompt) {
  failures.push(
    "SYSTEM_PROMPT drift: src/pipeline/prompt.js's SYSTEM_PROMPT does not match functions/index.js's STRUCTURE_SYSTEM_PROMPT_RULES."
  );
}

// --- contracts.js, behaviorally ---
const fnContracts = require(join(root, 'functions', 'contracts.js'));

const CONTRACT_PROBE_CASES = [
  {
    label: 'a valid, coherent project response',
    response: {
      decision: 'project',
      reasoning: 'r',
      confidence: 0.9,
      targetProjectId: null,
      project: { name: 'P' },
      sections: [{ ref: 's1', name: 'Section' }],
      tasks: [
        { content: 'Task A', priority: 2, due: null, sectionRef: 's1', subtasks: [{ content: 'Sub A1', priority: 1, due: null }] }
      ],
      needsClarification: false,
      clarificationQuestion: null
    },
    opts: { existingProjectIds: [] }
  },
  {
    label: 'missing decision',
    response: {
      reasoning: 'r',
      confidence: 0.9,
      targetProjectId: null,
      project: null,
      tasks: [],
      needsClarification: false,
      clarificationQuestion: null
    },
    opts: {}
  },
  {
    label: 'an out-of-contract top-level field',
    response: {
      decision: 'tasks',
      reasoning: 'r',
      confidence: 0.5,
      targetProjectId: null,
      project: null,
      tasks: [{ content: 'T', priority: 1, due: null }],
      needsClarification: false,
      clarificationQuestion: null,
      notInTheContract: true
    },
    opts: {}
  },
  {
    label: 'targetProjectId not in existingProjectIds',
    response: {
      decision: 'tasks',
      reasoning: 'r',
      confidence: 0.5,
      targetProjectId: 'ghost-id',
      project: null,
      tasks: [{ content: 'T', priority: 1, due: null }],
      needsClarification: false,
      clarificationQuestion: null
    },
    opts: { existingProjectIds: ['real-id'] }
  },
  {
    label: 'a priority out of range',
    response: {
      decision: 'tasks',
      reasoning: 'r',
      confidence: 0.5,
      targetProjectId: null,
      project: null,
      tasks: [{ content: 'T', priority: 9, due: null }],
      needsClarification: false,
      clarificationQuestion: null
    },
    opts: {}
  },
  {
    // Priority 5 specifically, not just "obviously out of range" (9): the
    // boundary itself is the part most likely to drift one-off (a stray
    // `<= 5` instead of `<= 4`), so this has to be probed directly rather
    // than trusting a wildly-out-of-range value to exercise the same code
    // path. Caught a real gap in this exact script during development: an
    // earlier version of these cases used only priority 9 and missed a
    // deliberately-introduced `p <= 5` drift entirely, since 9 fails either
    // way.
    label: 'priority exactly one past the valid range (the boundary itself)',
    response: {
      decision: 'tasks',
      reasoning: 'r',
      confidence: 0.5,
      targetProjectId: null,
      project: null,
      tasks: [{ content: 'T', priority: 5, due: null }],
      needsClarification: false,
      clarificationQuestion: null
    },
    opts: {}
  }
];

for (const c of CONTRACT_PROBE_CASES) {
  const srcResult = srcContracts.validateStructure(c.response, c.opts);
  const fnResult = fnContracts.validateStructure(c.response, c.opts);
  if (JSON.stringify(srcResult) !== JSON.stringify(fnResult)) {
    failures.push(
      `contracts.js drift: validateStructure disagrees on "${c.label}". src: ${JSON.stringify(srcResult)} fn: ${JSON.stringify(fnResult)}`
    );
  }
}

const GROUNDING_PROBE_CASES = [
  { content: 'Book campsite reservation', transcript: 'I need to book the campsite reservation this week.' },
  { content: 'Completely invented task nobody said', transcript: 'I need to book the campsite reservation this week.' },
  { content: 'Hi', transcript: 'I need to book the campsite reservation this week.' } // short content, always grounded
];

for (const c of GROUNDING_PROBE_CASES) {
  const srcResult = srcContracts.isGroundedInTranscript(c.content, c.transcript);
  const fnResult = fnContracts.isGroundedInTranscript(c.content, c.transcript);
  if (srcResult !== fnResult) {
    failures.push(
      `contracts.js drift: isGroundedInTranscript disagrees on "${c.content}" vs "${c.transcript}". src: ${srcResult} fn: ${fnResult}`
    );
  }
}

const ungroundedResponse = {
  tasks: [
    { content: 'Book campsite reservation', subtasks: [{ content: 'Invented sub-task' }] },
    { content: 'Also totally made up' }
  ]
};
const ungroundedTranscript = 'I need to book the campsite reservation this week.';
const srcUngrounded = srcContracts.ungroundedContents(ungroundedResponse, ungroundedTranscript);
const fnUngrounded = fnContracts.ungroundedContents(ungroundedResponse, ungroundedTranscript);
if (JSON.stringify(srcUngrounded) !== JSON.stringify(fnUngrounded)) {
  failures.push(
    `contracts.js drift: ungroundedContents disagrees. src: ${JSON.stringify(srcUngrounded)} fn: ${JSON.stringify(fnUngrounded)}`
  );
}

if (failures.length) {
  console.error('Prompt sync check FAILED:\n');
  for (const f of failures) console.error(`- ${f}`);
  console.error(
    '\nsrc/pipeline/prompt.js <-> functions/index.js (STRUCTURE_SYSTEM_PROMPT_RULES) and ' +
      'src/pipeline/contracts.js <-> functions/contracts.js are hand-synced on purpose (Firebase ' +
      'Functions cannot import ../src/pipeline). Edit one, then copy the exact same change into its pair.'
  );
  process.exit(1);
}

console.log('Prompt sync check passed: SYSTEM_PROMPT rules and contracts.js both match between src/pipeline and functions/.');
