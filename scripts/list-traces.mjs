// Lists the most recent structureTraces for one user, cancellations first,
// since a rejected proposal is the highest-signal case to review: the model
// got something wrong that mattered enough to reject the whole thing, not
// just a detail worth an edit. Pending next, confirmed last. Reads via
// firebase-admin, not the Function's own service-account path, so this only
// ever runs locally, by a human reviewing real usage. See
// docs/llm-pipeline.md.
//
// One-time local prerequisite, once per machine:
//   gcloud auth application-default login
// against the super-ramble GCP project.
//
// Run: npm run traces:list -- --uid <uid> [--limit 20]

import admin from 'firebase-admin';

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
if (!args.uid) {
  console.error('Usage: npm run traces:list -- --uid <uid> [--limit 20]');
  process.exit(1);
}
const limit = Number(args.limit || 20);

const OUTCOME_ORDER = { cancelled: 0, pending: 1, confirmed: 2 };

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'super-ramble' });
  const db = admin.firestore();

  const snap = await db
    .collection(`users/${args.uid}/structureTraces`)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  if (snap.empty) {
    console.log(`No structureTraces found for ${args.uid}.`);
    return;
  }

  const traces = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  traces.sort((a, b) => (OUTCOME_ORDER[a.outcome] ?? 1) - (OUTCOME_ORDER[b.outcome] ?? 1));

  for (const t of traces) {
    const createdAt = t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : String(t.createdAt);
    console.log(t.id);
    if (t.traceWriteFailed) {
      // The primary trace write itself failed (see functions/index.js's
      // logStructureTrace fallback); there is no transcript or response to
      // show, only the error the fallback captured. Shown plainly, not as a
      // silent gap and not crashing on the missing fields.
      console.log(`  createdAt: ${createdAt}  TRACE WRITE FAILED, nothing captured`);
      console.log(`  errorCode: ${t.errorCode ?? '(none)'}  errorMessage: ${truncate(t.errorMessage, 200)}`);
      console.log('');
      continue;
    }
    console.log(`  createdAt: ${createdAt}  ok: ${t.ok}  outcome: ${t.outcome}`);
    console.log(`  decision: ${t.response?.decision ?? '(none)'}  confidence: ${t.response?.confidence ?? '(none)'}`);
    console.log(`  transcript: ${truncate(t.transcript, 80)}`);
    // scripts/grade-traces.mjs (npm run traces:grade) writes these onto a
    // trace once graded. Absent on an ungraded trace, shown plainly, not as
    // a blank line, so a listing immediately surfaces what's flagged. This
    // grader only flags; it never edits src/pipeline/prompt.js or writes an
    // eval fixture, and its own verdicts are not infallible, spot-check them
    // against a real manual read (docs/llm-pipeline.md).
    if ('judgedAt' in t) {
      const judgedAt = t.judgedAt?.toDate ? t.judgedAt.toDate().toISOString() : String(t.judgedAt);
      const flagged = t.judgeCompleteness === 'flag' || t.judgeCorrectness === 'flag';
      const tag = flagged ? 'FLAGGED' : 'ok';
      console.log(
        `  judge: ${tag}  completeness: ${t.judgeCompleteness ?? '(none)'}  correctness: ${t.judgeCorrectness ?? '(none)'}  judgedAt: ${judgedAt}`
      );
      if (flagged && t.judgeNotes) console.log(`  judgeNotes: ${truncate(t.judgeNotes, 200)}`);
    } else {
      console.log('  judge: not graded yet (npm run traces:grade)');
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
