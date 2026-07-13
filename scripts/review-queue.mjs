// The monthly human review queue: lists pipelineLearningLog documents the
// automatic grading trigger (functions/index.js's gradeStructureTrace)
// flagged but could not resolve on its own, kind: "flagged", resolved:
// false. Not every flagged trace becomes a lesson; a human decides that
// here, the same "quality over quantity" discipline evals/fixtures/
// promotion already follows (docs/llm-pipeline.md's review cadence).
//
// A flagged entry lands here for one of a few real reasons: the trace was
// cancelled (nothing to auto-promote from, since there is no corrected
// tree); the user confirmed with no edits even though the grader flagged
// something (a real disagreement between the two signals, worth a human's
// eyes); or a confirmed_with_edits trace's auto-promotion attempt itself
// failed (targetProjectId present, the corrected tree couldn't be fully
// reconstructed, or it failed contract validation), each stated plainly in
// the entry's own summary.
//
// Follows scripts/list-traces.mjs and scripts/promote-trace.mjs's exact
// pattern: firebase-admin with Application Default Credentials, a local
// script a human runs by hand. Never runs as part of a live request.
//
// Run:
//   node scripts/review-queue.mjs                                    # list
//   node scripts/review-queue.mjs --resolve <logId>                  # mark resolved, no promotion
//   node scripts/review-queue.mjs --resolve <logId> --promote --use-live-response
//   node scripts/review-queue.mjs --resolve <logId> --promote --expected-file ./correction.json
//
// --expected-file takes the exact { "mockResponse": {...} } shape
// scripts/promote-trace.mjs's own --expected-file already uses, the same
// hand-written-correction convention, reused rather than re-invented.

import { readFile } from 'node:fs/promises';
import admin from 'firebase-admin';
import { validateStructure, ungroundedContents } from '../src/pipeline/contracts.js';

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

const args = parseArgs(process.argv.slice(2));
const REFERENCE_EXAMPLES_CAP = 30;

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

async function listQueue(db) {
  const snap = await db
    .collection('pipelineLearningLog')
    .where('kind', '==', 'flagged')
    .where('resolved', '==', false)
    .orderBy('date', 'asc')
    .get();

  if (snap.empty) {
    console.log('Nothing in the review queue. Every flagged entry has been resolved.');
    return;
  }

  console.log(`${snap.size} unresolved flagged entr${snap.size === 1 ? 'y' : 'ies'}, oldest first:\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    const date = d.date?.toDate ? d.date.toDate().toISOString() : String(d.date);
    console.log(doc.id);
    console.log(`  date: ${date}  uid: ${d.uid ?? '(none)'}  traceId: ${d.traceId ?? '(none)'}`);
    console.log(`  summary: ${truncate(d.summary, 300)}`);
    console.log('');
  }
  console.log('Resolve one: node scripts/review-queue.mjs --resolve <logId> [--promote --use-live-response | --expected-file <path>]');
}

async function enforceReferenceExamplesCap(db) {
  const snap = await db.collection('referenceExamples').get();
  if (snap.size <= REFERENCE_EXAMPLES_CAP) return;
  const prunable = snap.docs
    .filter((d) => d.data().source !== 'seed')
    .sort((a, b) => (a.data().addedAt?.toMillis?.() ?? 0) - (b.data().addedAt?.toMillis?.() ?? 0));
  if (prunable.length === 0) return; // over cap on seed docs alone; nothing safe to prune
  await prunable[0].ref.delete();
  console.log(`referenceExamples was over the ${REFERENCE_EXAMPLES_CAP}-document cap; pruned the oldest non-seed entry.`);
}

async function resolveEntry(db) {
  const logRef = db.collection('pipelineLearningLog').doc(args.resolve);
  const logSnap = await logRef.get();
  if (!logSnap.exists) {
    console.error(`No pipelineLearningLog entry ${args.resolve}.`);
    process.exit(1);
  }
  const log = logSnap.data();

  if (!args.promote) {
    await logRef.set({ resolved: true }, { merge: true });
    console.log(`Marked ${args.resolve} resolved, no promotion (the human decided this one doesn't need to teach the model anything).`);
    return;
  }

  const hasLive = Boolean(args['use-live-response']);
  const hasExpectedFile = Boolean(args['expected-file']);
  if (!hasLive && !hasExpectedFile) {
    console.error('--promote requires exactly one of --use-live-response or --expected-file <path>.');
    process.exit(1);
  }
  if (hasLive && hasExpectedFile) {
    console.error('Pass exactly one of --use-live-response or --expected-file, not both.');
    process.exit(1);
  }
  if (!log.uid || !log.traceId) {
    console.error(`Entry ${args.resolve} has no uid/traceId on it; cannot look up the trace to promote.`);
    process.exit(1);
  }

  const traceSnap = await db.doc(`users/${log.uid}/structureTraces/${log.traceId}`).get();
  if (!traceSnap.exists) {
    console.error(`Trace ${log.traceId} (uid ${log.uid}) no longer exists; cannot promote.`);
    process.exit(1);
  }
  const trace = traceSnap.data();

  let response;
  if (hasLive) {
    if (!trace.response) {
      console.error(`Trace ${log.traceId} has no parsed response to promote.`);
      process.exit(1);
    }
    response = trace.response;
  } else {
    const raw = JSON.parse(await readFile(args['expected-file'], 'utf8'));
    if (!raw.mockResponse) {
      console.error(`${args['expected-file']} must contain a top-level "mockResponse" object.`);
      process.exit(1);
    }
    response = raw.mockResponse;
  }

  const { valid, errors } = validateStructure(response, { existingProjectIds: [] });
  const ungrounded = valid ? ungroundedContents(response, trace.transcript) : [];
  if (!valid || ungrounded.length) {
    console.error('Refusing to promote, this response does not pass the contract:');
    for (const e of errors) console.error(`  - ${e}`);
    for (const c of ungrounded) console.error(`  - invented content not in the transcript: ${c}`);
    process.exit(1);
  }

  // A reference example must stay generic and reusable, never tied to one
  // real historical Firestore id, the same reasoning the auto-promotion
  // trigger already applies (functions/index.js). A human reviewing here
  // could still promote a routing trace by hand-writing a corrected
  // response with targetProjectId stripped via --expected-file; this only
  // guards against promoting the trace's own real response unexamined.
  if (response.targetProjectId) {
    console.error(
      'Refusing to promote: response.targetProjectId is set (a real internal project id). ' +
        'A reference example must stay generic; use --expected-file with targetProjectId removed if this should still teach the model something.'
    );
    process.exit(1);
  }

  await db.collection('referenceExamples').add({
    transcript: trace.transcript,
    response,
    source: 'manual',
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
    promotedFromTraceId: log.traceId,
    notes: `Manually promoted from the review queue. ${truncate(log.summary, 200)}`
  });
  await enforceReferenceExamplesCap(db);
  await logRef.set({ resolved: true }, { merge: true });

  console.log(`Promoted trace ${log.traceId} into referenceExamples (source: manual) and marked ${args.resolve} resolved.`);
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'super-ramble' });
  const db = admin.firestore();

  if (args.resolve) {
    await resolveEntry(db);
  } else {
    await listQueue(db);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
