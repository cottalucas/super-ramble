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
// functions/index.js requires firebase-admin, firebase-functions, and
// @anthropic-ai/sdk, installed only under functions/node_modules by its own
// `npm ci --prefix functions`, a step CI does not run (the root `npm ci`
// this eval step runs under never touches it; a first version of this script
// required functions/index.js directly and failed in CI with
// "Cannot find module 'firebase-functions/v2/https'" for exactly this
// reason, working only by accident locally where functions/node_modules
// happened to already exist). To avoid depending on functions/ having its
// own dependencies installed, the STRUCTURE_SYSTEM_PROMPT_RULES array is
// extracted directly from functions/index.js's source text (a plain
// string-array literal, parsed with a balanced-bracket scan, then evaluated
// in isolation) instead of requiring the module. functions/referenceExamples.js
// has zero external dependencies (plain data plus one pure function), so it
// is required directly; that one is genuinely safe regardless of whether
// functions/node_modules exists.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYSTEM_PROMPT } from '../src/pipeline/prompt.js';
import { REFERENCE_EXAMPLES as SRC_EXAMPLES, formatReferenceExamples as srcFormat } from '../src/pipeline/referenceExamples.js';

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

const functionsIndexSource = readFileSync(join(root, 'functions', 'index.js'), 'utf8');
const fnRules = extractArrayLiteral(functionsIndexSource, 'STRUCTURE_SYSTEM_PROMPT_RULES', 'functions/index.js');

const { REFERENCE_EXAMPLES: FN_EXAMPLES, formatReferenceExamples: fnFormat } = require(
  join(root, 'functions', 'referenceExamples.js')
);

const fnSystemPrompt = [fnRules.join('\n'), '', fnFormat(FN_EXAMPLES)].join('\n');

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
if (SYSTEM_PROMPT !== fnSystemPrompt) {
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
