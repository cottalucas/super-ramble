// Real timing stats for the /structure call's "structure phase timings" log
// line (functions/index.js, unconditional on every real call, see
// docs/resolution-log.md's 2026-07-14 phase-timing entries). Reports
// percentiles of totalMs across real Cloud Logging history, bucketed against
// each call's real outputTokens (cross-referenced from
// users/{uid}/structureTraces, the same collection scripts/list-traces.mjs
// already reads), so a genuinely slow call can be told apart from a short one
// that just happened to run cold.
//
// The log line is written via console.log('structure phase timings', obj),
// which Cloud Logging stores as textPayload (Node's console.log formats a
// plain object with require('util').inspect, not JSON.stringify), verified
// directly against real entries before writing the parser below rather than
// assumed. Do not assume jsonPayload without checking again if this line's
// call site ever changes.
//
// One-time local prerequisite, once per machine (same as scripts/list-traces.mjs):
//   gcloud auth application-default login
// against the super-ramble GCP project.
//
// Run: npm run structure:timing-stats

import admin from 'firebase-admin';

const PROJECT_ID = 'super-ramble';
const LOG_FILTER =
  'resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND textPayload:"structure phase timings"';
// Safety cap on pagination: this is a low-volume, single-dogfooding-user app
// today (docs/llm-pipeline.md's review cadence already states this), so this
// comfortably covers all real history without risking an unbounded loop if
// Cloud Logging's pageToken behavior ever changes.
const MAX_PAGES = 20;
const PAGE_SIZE = 1000;

const OUTPUT_TOKEN_BUCKETS = [
  { label: '<1000 output tokens', test: (t) => t < 1000 },
  { label: '1000-4000 output tokens', test: (t) => t >= 1000 && t < 4000 },
  { label: '4000-7000 output tokens', test: (t) => t >= 4000 && t < 7000 },
  { label: '7000-8192 output tokens (near/at the max_tokens cap)', test: (t) => t >= 7000 }
];

// The log line is a plain JS object, printed via util.inspect (unquoted
// keys, single-quoted strings), not JSON. Extracts each known field by name
// rather than attempting to parse or eval the payload as a whole; safe
// because this only ever reads a payload this app's own code produced.
function parsePhaseTimingsPayload(textPayload) {
  const match = textPayload.match(/structure phase timings\s*\{([\s\S]*)\}/);
  if (!match) return null;
  const body = match[1];
  const record = {};
  const fieldRe = /(\w+):\s*(?:'([^']*)'|(-?\d+(?:\.\d+)?)|null)/g;
  let m;
  while ((m = fieldRe.exec(body))) {
    const [, key, strVal, numVal] = m;
    record[key] = strVal !== undefined ? strVal : numVal !== undefined ? Number(numVal) : null;
  }
  return record;
}

async function fetchAllTimingLogEntries(accessToken) {
  const entries = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetch('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        resourceNames: [`projects/${PROJECT_ID}`],
        filter: LOG_FILTER,
        orderBy: 'timestamp desc',
        pageSize: PAGE_SIZE,
        ...(pageToken ? { pageToken } : {})
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Cloud Logging entries:list failed (${res.status}): ${body.slice(0, 500)}`);
    }
    const body = await res.json();
    const batch = body.entries || [];
    entries.push(...batch);
    // Cloud Logging can return a nextPageToken even on the final, empty
    // page (observed live against this project); stop once a page comes
    // back with nothing new, not only when the token itself is absent.
    if (!body.nextPageToken || batch.length === 0) break;
    pageToken = body.nextPageToken;
  }
  return entries;
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

function fmtSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function printPercentiles(label, valuesMs) {
  if (!valuesMs.length) {
    console.log(`${label}: no data`);
    return;
  }
  const sorted = [...valuesMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);
  const max = sorted[sorted.length - 1];
  console.log(`${label}: n=${sorted.length}  p50=${fmtSeconds(p50)}  p90=${fmtSeconds(p90)}  max=${fmtSeconds(max)}`);
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  const db = admin.firestore();
  const accessToken = (await admin.credential.applicationDefault().getAccessToken()).access_token;

  console.log(`Fetching real "structure phase timings" log entries for ${PROJECT_ID}...`);
  const rawEntries = await fetchAllTimingLogEntries(accessToken);
  const records = rawEntries
    .map((e) => parsePhaseTimingsPayload(e.textPayload || ''))
    .filter((r) => r && Number.isFinite(r.totalMs));

  if (!records.length) {
    console.log('No "structure phase timings" log entries found. Nothing to report.');
    console.log('This line is written unconditionally on every real /structure call; either none have');
    console.log('run yet, or they have aged out of Cloud Logging\'s retention window.');
    return;
  }

  // Cross-reference each traceId against the real structureTraces document
  // for its own inputTokens/outputTokens, the same collection
  // scripts/list-traces.mjs already reads. A collectionGroup query, not a
  // per-uid loop: this app is low-volume enough (docs/llm-pipeline.md) that
  // fetching the whole collection once is simpler and cheaper than
  // reconstructing a uid list first.
  const traceSnap = await db.collectionGroup('structureTraces').get();
  const traceById = new Map();
  for (const doc of traceSnap.docs) {
    traceById.set(doc.id, doc.data());
  }

  for (const r of records) {
    const trace = r.traceId ? traceById.get(r.traceId) : null;
    r.outputTokens = trace && Number.isFinite(trace.outputTokens) ? trace.outputTokens : null;
  }

  records.sort((a, b) => b.totalMs - a.totalMs);

  console.log(`\n${records.length} real call(s) found.\n`);

  if (records.length < 10) {
    console.log(
      `Note: only ${records.length} data point(s) exist so far (this instrumentation is new,` +
        ' docs/resolution-log.md, 2026-07-14). Percentiles below are real but low-confidence at this' +
        ' sample size; re-run this report as more real calls accumulate.\n'
    );
  }

  console.log('=== Per-call detail (newest first) ===');
  for (const r of records) {
    const tokensLabel = r.outputTokens != null ? `${r.outputTokens} output tokens` : 'output tokens unknown';
    console.log(
      `  ${r.traceId ?? '(no traceId)'}  total=${fmtSeconds(r.totalMs)}  modelCall=${fmtSeconds(r.modelCall ?? 0)}  ${tokensLabel}`
    );
  }

  console.log('\n=== Overall totalMs percentiles ===');
  printPercentiles('All real calls', records.map((r) => r.totalMs));

  console.log('\n=== totalMs percentiles bucketed by output tokens ===');
  for (const bucket of OUTPUT_TOKEN_BUCKETS) {
    const inBucket = records.filter((r) => r.outputTokens != null && bucket.test(r.outputTokens));
    printPercentiles(bucket.label, inBucket.map((r) => r.totalMs));
  }
  const unknownBucket = records.filter((r) => r.outputTokens == null);
  if (unknownBucket.length) {
    printPercentiles('output tokens unknown (no matching trace)', unknownBucket.map((r) => r.totalMs));
  }

  console.log('\n=== modelCall share of totalMs ===');
  const shareValues = records
    .filter((r) => Number.isFinite(r.modelCall) && r.totalMs > 0)
    .map((r) => r.modelCall / r.totalMs);
  if (shareValues.length) {
    const avgShare = shareValues.reduce((a, b) => a + b, 0) / shareValues.length;
    console.log(`modelCall is ${(avgShare * 100).toFixed(1)}% of totalMs on average across these calls.`);
  }
}

main().catch((err) => {
  console.error('structure-timing-stats could not run.');
  console.error(err.message);
  process.exit(1);
});
