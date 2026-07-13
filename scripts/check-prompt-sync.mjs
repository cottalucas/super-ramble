// Fails loudly if the Structure prompt's hand-synced copies drift.
//
// Firebase Functions deploys only the functions/ directory as its own
// CommonJS package, so it cannot import the ESM modules under src/pipeline
// (docs/resolution-log.md, 2026-07-06). That forces two pairs of files to be
// kept identical by hand:
//   - src/pipeline/prompt.js's SYSTEM_PROMPT        <-> functions/index.js's STRUCTURE_SYSTEM_PROMPT
//   - src/pipeline/referenceExamples.js's REFERENCE_EXAMPLES <-> functions/referenceExamples.js's REFERENCE_EXAMPLES
// This exact "kept in sync by hand" duplication already caused a real bug
// once (the priority-direction fix, docs/resolution-log.md, 2026-07-08,
// caught only by a live trace, not by CI). This script is the guard so a
// future edit to one copy and not the other fails CI immediately instead of
// silently drifting until the next live incident.
//
// No network calls, no credentials required. Requiring functions/index.js
// has no side effects beyond registering the Cloud Function definition and
// admin.initializeApp() (lazy, does not require real credentials to load);
// verified safe to require from a local script the same way
// scripts/list-traces.mjs and scripts/promote-trace.mjs already rely on the
// Admin SDK loading without a live call.
//
// Run: node scripts/check-prompt-sync.mjs (wired into npm run eval and ci.yml)

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYSTEM_PROMPT } from '../src/pipeline/prompt.js';
import { REFERENCE_EXAMPLES as SRC_EXAMPLES, formatReferenceExamples as srcFormat } from '../src/pipeline/referenceExamples.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const functionsIndex = require(join(root, 'functions', 'index.js'));
const { REFERENCE_EXAMPLES: FN_EXAMPLES } = require(join(root, 'functions', 'referenceExamples.js'));

const failures = [];

// Sanity check first: the formatting function itself must produce non-empty,
// well-formed text, and prompt.js must actually contain it (not just define
// it and forget to append it). Offline, so this cannot prove the live model
// behaves differently, only that the block is real and wired in.
const formatted = srcFormat(SRC_EXAMPLES);
if (typeof formatted !== 'string' || !formatted.trim()) {
  failures.push('formatReferenceExamples(REFERENCE_EXAMPLES) produced empty output.');
} else {
  if (!SYSTEM_PROMPT.includes(formatted)) {
    failures.push('src/pipeline/prompt.js SYSTEM_PROMPT does not contain the formatted reference-examples block.');
  }
  for (const ex of SRC_EXAMPLES) {
    if (!formatted.includes(ex.transcript)) {
      failures.push(`A reference example's transcript did not survive formatting: "${ex.transcript.slice(0, 40)}..."`);
    }
  }
}

// The two SYSTEM_PROMPT strings, byte for byte.
if (SYSTEM_PROMPT !== functionsIndex.STRUCTURE_SYSTEM_PROMPT) {
  failures.push(
    "SYSTEM_PROMPT drift: src/pipeline/prompt.js's SYSTEM_PROMPT does not match functions/index.js's STRUCTURE_SYSTEM_PROMPT."
  );
}

// The two REFERENCE_EXAMPLES arrays, structurally.
if (JSON.stringify(SRC_EXAMPLES) !== JSON.stringify(FN_EXAMPLES)) {
  failures.push(
    "REFERENCE_EXAMPLES drift: src/pipeline/referenceExamples.js's array does not match functions/referenceExamples.js's array."
  );
}

if (failures.length) {
  console.error('Prompt sync check FAILED:\n');
  for (const f of failures) console.error(`- ${f}`);
  console.error(
    '\nsrc/pipeline/prompt.js, src/pipeline/referenceExamples.js, functions/index.js, and ' +
      'functions/referenceExamples.js are hand-synced on purpose (Firebase Functions cannot ' +
      'import ../src/pipeline). Edit one, then copy the exact same change into its pair.'
  );
  process.exit(1);
}

console.log('Prompt sync check passed: SYSTEM_PROMPT and REFERENCE_EXAMPLES match between src/pipeline and functions/.');
