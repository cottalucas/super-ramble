// Diagnostic for the open complex-transcript 502 (docs/resolution-log.md,
// 2026-07-14): sends the same real request to this Function's direct Cloud
// Run URL and to the Hosting-proxied /api/structure route, sequentially, to
// show whether Hosting's `/api/**` rewrite is the layer cutting the
// connection around 90-100s, or whether the direct Cloud Run call cuts off
// too (meaning something else is responsible). Diagnostic-only: makes no
// change to functions/index.js, firebase.json, or any production behavior.
//
// Requires:
//   DIAGNOSE_ALLOW_LIVE=true   explicit opt-in, same pattern as
//                              EVAL_ALLOW_LIVE in scripts/eval-live.mjs;
//                              this spends real Anthropic credits and hits
//                              the real deployed site.
//   FIREBASE_ID_TOKEN          a real Firebase Auth ID token, the same
//                              value src/lib/authToken.js's getAuthToken
//                              sends as the `authorization: Bearer <token>`
//                              header. This tool never extracts one itself;
//                              see the instructions printed below.
//
// Run: DIAGNOSE_ALLOW_LIVE=true FIREBASE_ID_TOKEN=<token> npm run diagnose:hosting-cutoff

const DIRECT_URL = process.env.DIAGNOSE_DIRECT_URL || 'https://api-5cvpktolta-uc.a.run.app/structure';
const HOSTING_URL = process.env.DIAGNOSE_HOSTING_URL || 'https://super-ramble.web.app/api/structure';

// Bounds how long this tool itself will wait for a single call before giving
// up, well above the ~90-100s cutoff window this is investigating, so a
// hung connection cannot block the run forever. Hitting this guard is
// reported distinctly from the natural infra cutoff below.
const SAFETY_TIMEOUT_MS = 150_000;

if (process.env.DIAGNOSE_ALLOW_LIVE !== 'true') {
  console.error('This diagnostic is gated. Set DIAGNOSE_ALLOW_LIVE=true to run it.');
  console.error('It spends real Anthropic credits and calls the real deployed site.');
  process.exit(1);
}

if (!process.env.FIREBASE_ID_TOKEN) {
  console.error('FIREBASE_ID_TOKEN is required. This tool never extracts one itself.');
  console.error('');
  console.error('To get your own token safely:');
  console.error('  1. Sign into the deployed app at https://super-ramble.web.app');
  console.error('  2. Submit a real Super Ramble transcript (Structure a dump, as usual)');
  console.error('  3. Open DevTools > Network, find the real POST /api/structure request');
  console.error('  4. Copy the value of its `authorization` request header (everything');
  console.error('     after "Bearer "), the same token src/lib/authToken.js sends');
  console.error('  5. Re-run this script with FIREBASE_ID_TOKEN set to that value:');
  console.error('       DIAGNOSE_ALLOW_LIVE=true FIREBASE_ID_TOKEN=<token> npm run diagnose:hosting-cutoff');
  process.exit(1);
}

const token = process.env.FIREBASE_ID_TOKEN;

// Comparable in complexity to the transcript that reproduced this bug live
// (docs/resolution-log.md, 2026-07-14): three separate storylines (a
// Website Relaunch, referencing a project name that is a duplicate in the
// account; a birthday party with nested sub-tasks; a camping trip with
// nested sub-tasks), plus a fourth unrelated loose task. Kept as a fixed
// literal so this run is repeatable, not dependent on any real account's
// current state.
const TRANSCRIPT = `
Okay a few things on my mind. First, the website relaunch project - we need
to finalize the new homepage design by next Friday, then get it reviewed by
marketing, and once that's approved we need to migrate the blog content over,
which itself needs someone to export the old posts, clean up the broken
image links, and re-tag everything before importing. Also need to set up the
staging environment for that, and write a rollback plan in case the launch
goes wrong.

Second, completely different thing: Sarah's birthday party planning. That's
urgent, party's in two weeks. Need to book the venue first, then once that's
confirmed, order the cake, and separately handle invitations - design them,
print them, and mail them out, in that order. Also need to buy decorations
and figure out a playlist.

Third, the camping trip in August. Need to reserve the campsite, that's the
first thing. Then pack the gear - tent, sleeping bags, the cooler - and
separately plan the meals for three days, buy the groceries for those meals,
and check the weather forecast the week before we leave.

Oh, and one more unrelated thing, remind me to renew my passport, it expires
next month.
`.trim();

// Two entries sharing a name on purpose, to recreate the duplicate-project-
// name ambiguity condition described in resolution-log.md, without
// depending on any real account's live data.
const EXISTING_PROJECTS = [
  { id: 'diag-project-website-relaunch-1', name: 'Website Relaunch' },
  { id: 'diag-project-website-relaunch-2', name: 'Website Relaunch' }
];

const REQUEST_BODY = {
  transcript: TRANSCRIPT,
  existingProjects: EXISTING_PROJECTS,
  priorErrors: null
};

async function timedPost(url) {
  const start = Date.now();
  const controller = new AbortController();
  const guard = setTimeout(() => controller.abort(), SAFETY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(REQUEST_BODY),
      signal: controller.signal
    });
    const durationMs = Date.now() - start;
    const text = await res.text();
    let bodyJson = null;
    try {
      bodyJson = JSON.parse(text);
    } catch {
      // Not JSON: likely an upstream infra error page (generic 502 HTML),
      // not this Function's own explained error shape.
    }
    return {
      ok: true,
      aborted: false,
      status: res.status,
      durationMs,
      headers: Object.fromEntries(res.headers.entries()),
      bodyText: text,
      bodyJson
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      ok: false,
      aborted: controller.signal.aborted,
      status: null,
      durationMs,
      error: err.message
    };
  } finally {
    clearTimeout(guard);
  }
}

function fmtSeconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function printResult(label, url, result) {
  console.log(`--- ${label} ---`);
  console.log(`url: ${url}`);
  console.log(`duration: ${fmtSeconds(result.durationMs)}`);
  if (!result.ok) {
    console.log(`status: (no response)`);
    console.log(`error: ${result.error}${result.aborted ? ' (this tool\'s own safety timeout fired, not a natural cutoff)' : ''}`);
  } else {
    console.log(`status: ${result.status}`);
    console.log(`content-type: ${result.headers['content-type'] || '(none)'}`);
    console.log(`body (first 500 chars): ${result.bodyText.slice(0, 500)}`);
  }
  console.log('');
}

// "Completed" means this Function's own real response reached the caller,
// whether a success or its own explained JSON error (e.g. the max_tokens
// truncation 502 body) - not whether it was fast. "Cut off" means either the
// connection never came back at all, or it came back as a non-JSON body
// (a generic upstream infra error page substituted in its place).
function classify(result) {
  if (!result.ok) return 'cutoff';
  if (result.bodyJson !== null) return 'completed';
  return 'cutoff';
}

async function main() {
  console.log('super-ramble hosting-cutoff diagnostic');
  console.log(`direct Cloud Run URL:  ${DIRECT_URL}`);
  console.log(`hosting-proxied URL:   ${HOSTING_URL}`);
  console.log('Sending the same synthetic complex transcript to each, sequentially.\n');

  const direct = await timedPost(DIRECT_URL);
  printResult('(a) Direct Cloud Run', DIRECT_URL, direct);

  const hosting = await timedPost(HOSTING_URL);
  printResult('(b) Hosting-proxied /api/structure', HOSTING_URL, hosting);

  const directClass = classify(direct);

  console.log('=== Verdict ===');
  if (directClass === 'cutoff') {
    console.log(
      `The direct Cloud Run call also cut off/failed (duration ${fmtSeconds(direct.durationMs)}` +
        `${direct.ok ? `, status ${direct.status}, non-JSON body` : `, ${direct.error}`}).`
    );
    console.log(
      "Hosting's rewrite is NOT the culprit: something else (Cloud Run's own " +
        'infrastructure, or a layer in front of Cloud Run itself, unrelated to ' +
        'firebase.json) is responsible for the ~90-100s cutoff.'
    );
  } else {
    console.log(
      `The direct Cloud Run call completed with its own real response ` +
        `(status ${direct.status}, duration ${fmtSeconds(direct.durationMs)}).`
    );
    console.log(
      "Hosting's rewrite is confirmed as the bottleneck: the same request " +
        'that fails through /api/** succeeds when it bypasses Hosting entirely.'
    );
  }

  if (hosting.durationMs < 60_000 || hosting.bodyJson !== null) {
    console.log(
      '\nNote: the hosting-proxied call did not clearly reproduce the ' +
        `known cutoff pattern this run (duration ${fmtSeconds(hosting.durationMs)}` +
        `${hosting.ok ? `, status ${hosting.status}` : `, ${hosting.error}`}). Output length ` +
        'varies stochastically call to call (docs/resolution-log.md, 2026-07-14), ' +
        'so a single run completing does not by itself disprove the cutoff; ' +
        're-run if this result looks inconclusive.'
    );
  }
}

main().catch((err) => {
  console.error('Diagnostic could not run.');
  console.error(err.message);
  process.exit(1);
});
