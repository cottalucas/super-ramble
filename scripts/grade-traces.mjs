// Cheap, automatic quality check on saved structureTraces, so nobody has to
// read a growing trace collection blind. Follows scripts/list-traces.mjs and
// scripts/promote-trace.mjs's exact pattern: firebase-admin with Application
// Default Credentials, the same --uid argument convention, a local batch job
// Lucas runs by hand, same category as traces:list and traces:promote. Never
// runs as part of a live user request; nothing here touches functions/ or
// firestore.rules.
//
// Finds structureTraces documents with no judgedAt field yet, and for each
// makes one cheap call on this app's default Haiku model (never Sonnet: the
// judge must never touch the same model or cost tier as the real structuring
// call, so a grading run can't accidentally get confused with, or budgeted
// against, the thing it grades) asking it to compare the trace's own
// transcript against its own response and flag two things: whether anything
// mentioned in the transcript seems to be missing from the response, and
// whether priority or due dates look defensible given the transcript's own
// wording. The verdict is deliberately simple, "ok" or "flag" plus a
// one-line reason each, not a score: see docs/llm-pipeline.md, "Live capture
// and the eval flywheel." Writes back judgeCompleteness, judgeCorrectness,
// judgeNotes, judgedAt as a merge write; transcript and response are never
// touched.
//
// This grader only flags. It never edits src/pipeline/prompt.js and never
// writes an eval fixture itself; promoting a fixture (scripts/promote-trace.mjs)
// stays a human decision, same as today. Its own verdicts are not infallible
// either: spot-check them against a real manual read on the same review
// cadence docs/llm-pipeline.md already documents, the same "confirmed does
// not mean correct" lesson that already applied once to a user's own Confirm
// click (docs/resolution-log.md, 2026-07-08).
//
// One-time local prerequisite, once per machine (same as list-traces.mjs):
//   gcloud auth application-default login
// against the super-ramble GCP project. Also requires ANTHROPIC_API_KEY in
// your shell env: this is a local script, not the Function, so it cannot
// read the Firebase Functions secret of the same name; export the same key
// value locally to run this.
//
// Bounded the same way scripts/trace-summary.mjs already bounds local live
// spend: LLM_SPEND_CEILING_USD (default 50) stops the batch before it can
// run away on cost by accident. --limit caps how many ungraded traces one
// run grades (default 20), independent of the spend ceiling.
//
// Run: npm run traces:grade -- --uid <uid> [--limit 20]

import admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

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
  console.error('Usage: npm run traces:grade -- --uid <uid> [--limit 20]');
  process.exit(1);
}
const limit = Number(args.limit || 20);
const ceiling = Number(process.env.LLM_SPEND_CEILING_USD || 50);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required in your shell env to run this script (a local script, not the Function).');
  process.exit(1);
}

// Never Sonnet. This app's Haiku default (see functions/.env.example's
// ANTHROPIC_MODEL), deliberately not ANTHROPIC_STRUCTURE_MODEL: the grader
// must never touch the same model or cost tier as the real structuring call.
const GRADE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// Haiku 4.5 pricing, verified live against
// platform.claude.com/docs/en/about-claude/models/overview, the same
// discipline every other model id/price in this app follows: $1 / MTok in,
// $5 / MTok out.
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;

const GRADE_SYSTEM_PROMPT = [
  'You are a quality checker for a task-structuring tool, not the tool itself. You will be shown a transcript someone rambled and the structured response another model already produced from it. You do not restructure anything; you only judge what is already there.',
  'Check two things, independently:',
  '1. completeness: does anything mentioned in the transcript seem to be missing from the response (a task, a sub-task, a stated detail)? "ok" if nothing meaningful is missing, "flag" if something the transcript clearly asked for is absent.',
  '2. correctness: do the response\'s priorities and due dates look defensible given the transcript\'s own wording (its urgency language, its named dates)? "ok" if defensible, "flag" if a priority or due date looks backward or unsupported by anything the transcript actually said.',
  'Give a one-line reason for each verdict, in plain language, naming the specific task or phrase involved when you flag something. Do not invent detail the transcript does not contain, and do not judge style, tone, or project naming, only completeness and priority/due defensibility.'
].join('\n');

function buildGradeUserPrompt(transcript, response) {
  return [
    'TRANSCRIPT:',
    transcript,
    '',
    'RESPONSE TO JUDGE:',
    JSON.stringify(response),
    '',
    'Return your judgment now.'
  ].join('\n');
}

const GRADE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    completeness: { enum: ['ok', 'flag'] },
    completenessReason: { type: 'string' },
    correctness: { enum: ['ok', 'flag'] },
    correctnessReason: { type: 'string' }
  },
  required: ['completeness', 'completenessReason', 'correctness', 'correctnessReason'],
  additionalProperties: false
};

function usd(n) {
  return `$${n.toFixed(4)}`;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'super-ramble' });
  const db = admin.firestore();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Firestore has no native "field does not exist" filter, and this is a
  // low-volume, single-dogfooding-user collection (docs/llm-pipeline.md's
  // review cadence), so a full fetch plus a client-side filter is simple and
  // cheap, the same shape scripts/list-traces.mjs already uses for its own
  // full-collection read.
  const snap = await db.collection(`users/${args.uid}/structureTraces`).orderBy('createdAt', 'asc').get();
  if (snap.empty) {
    console.log(`No structureTraces found for ${args.uid}.`);
    return;
  }

  const candidates = snap.docs.filter((doc) => {
    const t = doc.data();
    return !t.traceWriteFailed && t.response && typeof t.transcript === 'string' && !('judgedAt' in t);
  });

  if (candidates.length === 0) {
    console.log(`Nothing to grade: every trace for ${args.uid} either already has judgedAt or has no response to judge.`);
    return;
  }

  const toGrade = candidates.slice(0, limit);
  console.log(`super-ramble trace grading, model ${GRADE_MODEL}`);
  console.log(`${candidates.length} ungraded trace(s) found, grading up to ${toGrade.length} this run.\n`);

  let spend = 0;
  let graded = 0;
  let flagged = 0;

  for (const doc of toGrade) {
    if (spend >= ceiling) {
      console.log(`\nSpend ceiling reached (${usd(spend)} of ${usd(ceiling)}). Stopping before grading ${doc.id}.`);
      console.log('Rerun this command later to pick up where it left off; ungraded traces are unaffected.');
      break;
    }

    const trace = doc.data();
    let verdict;
    try {
      const response = await client.messages.create({
        model: GRADE_MODEL,
        max_tokens: 512,
        system: GRADE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildGradeUserPrompt(trace.transcript, trace.response) }],
        output_config: { format: { type: 'json_schema', schema: GRADE_JSON_SCHEMA } }
      });

      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost =
        (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK + (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK;
      spend += cost;

      const text = (response.content || [])
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text)
        .join('');
      verdict = JSON.parse(text);
    } catch (err) {
      console.log(`SKIP  ${doc.id}  grading call failed: ${err.message}`);
      continue;
    }

    const judgeNotes = `Completeness: ${verdict.completenessReason} Correctness: ${verdict.correctnessReason}`;
    await doc.ref.set(
      {
        judgeCompleteness: verdict.completeness,
        judgeCorrectness: verdict.correctness,
        judgeNotes,
        judgedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    graded += 1;
    const isFlagged = verdict.completeness === 'flag' || verdict.correctness === 'flag';
    if (isFlagged) flagged += 1;
    const tag = isFlagged ? 'FLAG' : 'OK  ';
    console.log(`${tag}  ${doc.id}  completeness=${verdict.completeness}  correctness=${verdict.correctness}`);
    if (isFlagged) console.log(`      ${judgeNotes}`);
  }

  console.log(`\nGraded ${graded} trace(s), ${flagged} flagged. Spend this run: ${usd(spend)} of ${usd(ceiling)} ceiling.`);
  console.log('This grader only flags. It never edits src/pipeline/prompt.js or writes an eval fixture; promoting a');
  console.log('fixture (npm run traces:promote) and changing the prompt both stay human decisions. Spot-check its');
  console.log('verdicts against a real manual read on the same review cadence docs/llm-pipeline.md documents.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
