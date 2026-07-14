// Emulator-based integration test for the async-Structure pipeline
// (docs/resolution-log.md's async-Structure pass): proves, against the real
// Firebase emulator suite (Firestore + Functions + Auth, from this repo's
// own firebase.json), that:
//   1. A trace document created the same way POST /api/structure's fast
//      enqueue write does (status: 'processing') gets picked up by the real
//      processStructureTrace trigger and resolved, observed through a real
//      Firestore client SDK onSnapshot listener, the exact mechanism
//      SuperRambleModal.jsx's callModel uses in production.
//   2. The outcome race Phase 2 explicitly had to guard against (a user's
//      own 'cancelled' decision landing via POST /structure/outcome while
//      the trigger is still mid-flight) does not regress: the trigger's own
//      final write must never stomp a real outcome back to 'pending'.
//
// Gated behind EMULATOR_ALLOW_LIVE=true, the same explicit-opt-in pattern
// scripts/eval-live.mjs uses: processStructureTrace makes a real Anthropic
// call, which spends real credits even when everything else runs against
// the emulator (Anthropic itself is not emulated).
//
// Requires:
//   - The Firebase CLI (already a dev dependency of this repo's workflow).
//   - A real ANTHROPIC_API_KEY available to the Functions emulator: either
//     a gitignored functions/.secret.local file with
//     ANTHROPIC_API_KEY=<key> (Firebase's own documented local-secret
//     convention), or real gcloud application-default credentials already
//     set up for this project (the same one-time prerequisite
//     scripts/list-traces.mjs and scripts/structure-timing-stats.mjs use:
//     gcloud auth application-default login), which the Functions emulator
//     can use to fetch the real secret from Secret Manager.
//   - No Java runtime ships with this repo's own tooling; the Firestore
//     emulator needs one (this was not already present in every
//     environment this repo has been developed in; install one, e.g.
//     `brew install openjdk`, if `firebase emulators:exec` fails to start
//     Firestore).
//
// Run: EMULATOR_ALLOW_LIVE=true npm run test:structure-emulator
//
// A known, pre-existing, local-emulator-only issue this test can incidentally
// surface, not something it causes or is scoped to fix: gradeStructureTrace
// (an existing trigger, unrelated to this pass) can log an unhandled
// "Cannot read properties of undefined (reading 'serverTimestamp')" during
// the emulator's own shutdown drain, after this test has already reported
// PASS and exited 0. Reproduced against the local Functions emulator only
// (real production has an established track record of this exact call
// succeeding); see docs/resolution-log.md's async-Structure entry for the
// same class of issue found and fixed in this pass's own new code
// (processStructureTrace's logUsage call), and why gradeStructureTrace's own
// instance of it was left alone as a flagged, separate finding.
//
// This file plays two roles, detected by whether it is already running
// inside the emulator suite (FIRESTORE_EMULATOR_HOST is only set by
// `firebase emulators:exec` for the command it wraps): outside, it is the
// gate-check-and-launch wrapper; inside, it is the actual test.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const insideEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!insideEmulator) {
  if (process.env.EMULATOR_ALLOW_LIVE !== 'true') {
    console.error('This test is gated. Set EMULATOR_ALLOW_LIVE=true to run it.');
    console.error('processStructureTrace makes a real Anthropic call, spending real credits');
    console.error('even against the emulator (Anthropic itself is not emulated).');
    process.exit(1);
  }

  console.log('Starting the Firebase emulator suite (firestore, functions, auth) and running the test inside it...');
  try {
    execFileSync('firebase', ['emulators:exec', '--only', 'firestore,functions,auth', `node ${fileURLToPath(import.meta.url)}`], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
  } catch (err) {
    console.error('Emulator test run failed.');
    process.exit(typeof err.status === 'number' ? err.status : 1);
  }
  process.exit(0);
}

// --- Everything below only ever runs inside the emulator (re-invoked by
// `firebase emulators:exec` above), never on a real project. ---

const admin = (await import('firebase-admin')).default;
const { initializeApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously } = await import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, onSnapshot } = await import('firebase/firestore');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'super-ramble';
// Short and cheap on purpose: this only needs to exercise the real
// processStructureTrace path end to end, not evaluate structuring quality
// (that is evals/fixtures' and the live-eval harness's job). A flat,
// unambiguous "tasks" dump keeps both token cost and wall-clock time low.
const TEST_TRANSCRIPT = 'Buy milk. Call the dentist to reschedule.';
const RESOLUTION_TIMEOUT_MS = 90_000;

function assert(cond, message) {
  if (!cond) throw new Error(`FAIL: ${message}`);
}

async function createProcessingTraceDoc(adminDb, uid, overrides = {}) {
  const ref = await adminDb.collection(`users/${uid}/structureTraces`).add({
    transcript: TEST_TRANSCRIPT,
    existingProjectIds: [],
    priorErrors: null,
    status: 'processing',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    outcome: 'pending',
    outcomeAt: null,
    ...overrides
  });
  return ref;
}

async function waitForResolution(adminRef, { timeoutMs = RESOLUTION_TIMEOUT_MS } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await adminRef.get();
    const data = snap.data();
    if (data && data.status && data.status !== 'processing') return data;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${adminRef.id} to leave status: 'processing'`);
}

// Test 1: a normal trace resolves via the real trigger, observed through a
// real Firestore client SDK onSnapshot listener, not just an Admin SDK poll:
// this is the exact mechanism SuperRambleModal.jsx's callModel relies on in
// production, so a test that only polled with the Admin SDK would not
// actually prove the client-facing path works.
async function testNormalResolution(adminDb, clientDb, uid) {
  console.log('\n=== Test 1: normal resolution, observed via a real client onSnapshot listener ===');
  const ref = await createProcessingTraceDoc(adminDb, uid);

  const seenStatuses = [];
  const result = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject(new Error(`onSnapshot never observed a resolved status within ${RESOLUTION_TIMEOUT_MS}ms`));
    }, RESOLUTION_TIMEOUT_MS);

    const unsubscribe = onSnapshot(
      doc(clientDb, 'users', uid, 'structureTraces', ref.id),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        seenStatuses.push(data.status);
        if (data.status && data.status !== 'processing') {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(data);
        }
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });

  assert(seenStatuses.includes('processing'), 'client onSnapshot never observed the initial status: "processing"');
  assert(result.status === 'done' || result.status === 'failed', `expected a resolved status, got "${result.status}"`);
  assert('response' in result, 'expected a response field once resolved (even null on a failed call)');
  console.log(`PASS  trigger resolved the trace to status="${result.status}", observed by a real client onSnapshot listener`);
}

// Test 2: the outcome race Phase 2 explicitly guards against. A 'cancelled'
// outcome is written (simulating POST /structure/outcome) immediately after
// creation, before the trigger has any real chance to finish its model
// call. The trigger's own final write must not stomp this back to
// 'pending': this is the specific regression this test exists to catch.
async function testOutcomeRaceDoesNotRegress(adminDb, uid) {
  console.log('\n=== Test 2: outcome race (Discard while still processing) does not regress ===');
  const ref = await createProcessingTraceDoc(adminDb, uid);

  await ref.set({ outcome: 'cancelled', outcomeAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  const finalData = await waitForResolution(ref);
  assert(
    finalData.outcome === 'cancelled',
    `expected outcome to survive as "cancelled" through the trigger's final write, got "${finalData.outcome}"`
  );
  assert(
    finalData.status === 'done' || finalData.status === 'failed',
    `expected the trigger to still finish processing despite the race, got status="${finalData.status}"`
  );
  console.log(`PASS  outcome stayed "cancelled" after the trigger's own final write (status="${finalData.status}")`);
}

async function main() {
  admin.initializeApp({ projectId: PROJECT_ID });
  const adminDb = admin.firestore();

  const clientApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-emulator-key' });
  const clientAuth = getAuth(clientApp);
  const clientDb = getFirestore(clientApp);

  const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(clientDb, firestoreHost, Number(firestorePort));
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
  }

  // A real signed-in (emulator) user, not a fabricated uid: firestore.rules
  // requires request.auth.uid == uid to read a structureTraces document
  // (the exact rule this whole pass added owner read access to), so the
  // client listener below only works against a uid the Auth emulator
  // actually authenticated.
  const cred = await signInAnonymously(clientAuth);
  const uid = cred.user.uid;
  console.log(`Signed in as emulator uid ${uid}`);

  await testNormalResolution(adminDb, clientDb, uid);
  await testOutcomeRaceDoesNotRegress(adminDb, uid);

  console.log('\nAll emulator integration checks passed.');
  // The client SDK's own open connections (Firestore, Auth) would otherwise
  // keep this process alive indefinitely once main() resolves, which in
  // turn keeps the whole `firebase emulators:exec` wrapper (and the
  // Firestore/Functions emulators it started) running long after this test
  // is actually done.
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
