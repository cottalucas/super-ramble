// Turns the database log into the committed file. docs/pipeline-learnings.md
// stays a real file a person reads, not something a live Function writes to
// directly (the trigger and review-queue.mjs both only ever touch Firestore's
// pipelineLearningLog collection); this script is the one, explicitly
// human-run step that mirrors it into markdown, during the monthly review,
// same cadence docs/llm-pipeline.md already documents for everything else in
// this flywheel.
//
// An entry is eligible to mirror once it needs no further human judgment:
// an auto-promoted entry needed none in the first place (the two-signal bar
// already decided it), and a flagged entry becomes eligible only once
// scripts/review-queue.mjs has marked it resolved, so nothing half-decided
// ever lands in the committed doc. `mirrored` (a field this script owns,
// same "add what's functionally necessary beyond the literal field list"
// reasoning functions/index.js's `uid` addition already used) tracks what
// has already been written, so a second run only appends what is new.
//
// Follows scripts/list-traces.mjs's exact pattern: firebase-admin with
// Application Default Credentials, a local script a human runs by hand.
//
// Run: node scripts/sync-learnings.mjs [--dry-run]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import admin from 'firebase-admin';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docPath = join(root, 'docs', 'pipeline-learnings.md');
const dryRun = process.argv.includes('--dry-run');

function isoDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date();
  return d.toISOString().slice(0, 10);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

function formatEntry(id, data) {
  const date = isoDate(data.date);
  const isAutoPromoted = data.kind === 'auto-promoted';
  const title = isAutoPromoted
    ? `Auto-promoted: ${truncate(data.summary, 70)}`
    : `Reviewed and resolved: ${truncate(data.summary, 70)}`;

  const provenance = isAutoPromoted
    ? "Automatically promoted into `referenceExamples`: the user's own correction (`confirmed_with_edits`) and the automatic grader's independent flag agreed something was wrong. No human wrote this entry; `scripts/sync-learnings.mjs` mirrors it straight from `pipelineLearningLog` during the monthly review."
    : "Flagged by the automatic grader, reviewed and resolved by hand during the monthly check (`scripts/review-queue.mjs`). No further prose was added beyond what the review recorded; if this needed a real fix, that fix has its own entry above this one and its own `docs/resolution-log.md` entry.";

  return [
    `## ${date}: ${title}`,
    '',
    `trace \`${data.traceId ?? '(none)'}\` (uid \`${data.uid ?? '(none)'}\`, log entry \`${id}\`).`,
    '',
    data.summary || '(no summary recorded)',
    '',
    provenance,
    ''
  ].join('\n');
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'super-ramble' });
  const db = admin.firestore();

  // Low-volume collection (this app's single-dogfooding-user premise, same
  // as every other trace/log collection here); a full fetch plus a
  // client-side filter is simple and cheap, the same shape
  // scripts/grade-traces.mjs and scripts/list-traces.mjs already use for
  // their own full-collection reads.
  const snap = await db.collection('pipelineLearningLog').orderBy('date', 'asc').get();
  const eligible = snap.docs.filter((doc) => {
    const d = doc.data();
    if (d.mirrored) return false;
    if (d.kind === 'auto-promoted') return true;
    if (d.kind === 'flagged') return d.resolved === true;
    return false;
  });

  if (eligible.length === 0) {
    console.log('Nothing new to mirror. Every eligible pipelineLearningLog entry is already in docs/pipeline-learnings.md.');
    return;
  }

  console.log(`${eligible.length} entr${eligible.length === 1 ? 'y' : 'ies'} to mirror into docs/pipeline-learnings.md:`);
  for (const doc of eligible) console.log(`  ${doc.id} (${doc.data().kind})`);

  const newEntries = eligible.map((doc) => formatEntry(doc.id, doc.data())).join('\n---\n\n');

  if (dryRun) {
    console.log('\n--dry-run: not writing anything. Would append:\n');
    console.log(newEntries);
    return;
  }

  const current = await readFile(docPath, 'utf8');
  // New entries go right after the header/recipe block, above the most
  // recent hand-written entry, the same "newest first" order every other
  // append-only doc in this repo (docs/resolution-log.md) already uses.
  // The recipe section ends at the first "---" divider; everything from
  // there down is entries.
  const dividerIndex = current.indexOf('\n---\n');
  const updated =
    dividerIndex === -1
      ? `${current.trim()}\n\n---\n\n${newEntries}\n`
      : `${current.slice(0, dividerIndex + 5)}\n${newEntries}\n${current.slice(dividerIndex + 5)}`;

  await writeFile(docPath, updated);

  const batch = db.batch();
  for (const doc of eligible) batch.set(doc.ref, { mirrored: true }, { merge: true });
  await batch.commit();

  console.log(`\nWrote ${eligible.length} new entr${eligible.length === 1 ? 'y' : 'ies'} to docs/pipeline-learnings.md and marked them mirrored.`);
  console.log('Review the diff before committing, same as any other doc change.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
