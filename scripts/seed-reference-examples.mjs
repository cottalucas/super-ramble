// Seeds (or re-seeds) the 4 hand-picked original examples into the
// referenceExamples/{id} Firestore collection, source: "seed". Ran once as
// part of the pass that moved reference examples out of source files and
// into Firestore (docs/resolution-log.md); src/pipeline/referenceExamples.js
// and functions/referenceExamples.js, the two files these were originally
// hand-picked from, are gone now, deleted once that first run was confirmed.
// The data lives here as a literal array instead, not imported from those
// now-deleted files, so this script stays genuinely re-runnable as a
// disaster-recovery tool (the collection gets wiped or corrupted, a fresh
// environment needs seeding), not a one-shot script that would throw on a
// missing import the moment anyone ran it a second time. Copied verbatim
// from the deleted src/pipeline/referenceExamples.js, not retyped, at the
// time of that file's deletion.
//
// Follows scripts/list-traces.mjs's exact pattern: firebase-admin with
// Application Default Credentials, a local script a human runs by hand, not
// something a live request ever touches.
//
// NOT safe to blindly re-run against a healthy collection: Firestore add()
// always creates a new document, so running this against a collection that
// already has these 4 seed docs doubles them. Meant for the original seed or
// a genuine disaster-recovery reseed after confirming the collection is
// actually empty or missing these; --dry-run first, or check the collection
// directly, before trusting a run landed correctly, the same discipline
// every other migration-shaped script in this repo follows.
//
// One-time local prerequisite, once per machine:
//   gcloud auth application-default login
// against the super-ramble GCP project.
//
// Run: node scripts/seed-reference-examples.mjs [--dry-run]

import admin from 'firebase-admin';

const SEED_EXAMPLES = [
  {
    transcript:
      "Okay so I want to throw a surprise birthday party for Maya next month. I need to book a venue, send out invites to the group, order a cake, and figure out the playlist. For the invites I should make a guest list first and then send the messages.",
    response: {
      decision: 'project',
      reasoning: 'One coherent effort with dependent steps, so a project with nested sub-tasks fits.',
      confidence: 0.92,
      targetProjectId: null,
      project: { name: "Maya's Surprise Birthday Party" },
      tasks: [
        { content: 'Book a venue', priority: 2, due: null, subtasks: [] },
        {
          content: 'Send out invites',
          priority: 1,
          due: null,
          subtasks: [
            { content: 'Make a guest list', priority: 1, due: null },
            { content: 'Send the messages', priority: 1, due: null }
          ]
        },
        { content: 'Order a cake', priority: 1, due: null, subtasks: [] },
        { content: 'Figure out the playlist', priority: 1, due: null, subtasks: [] }
      ],
      needsClarification: false,
      clarificationQuestion: null
    }
  },
  {
    transcript:
      "\"Planning our camping trip to Big Sur, we leave Friday the 17th and come back Sunday the 19th. I still need to book the campsite reservation, that's urgent since sites fill up fast, should do it today or tomorrow. For gear, I need to check the tent for holes and patch it if needed, test the lantern batteries, and dig out the sleeping bags from the garage, that one's not urgent. For food, I need to plan meals for three days, buy propane for the stove, and pack the cooler, when I pack the cooler I need to get ice, drinks, and the stuff for burgers. For the car, I should check the tire pressure and pack the first aid kit, that one's important. Also need to download offline maps before we lose signal, and let the dog sitter know the exact dates.\"",
    response: {
      decision: 'project',
      reasoning:
        "The transcript describes one coherent effort (planning a camping trip) with multiple related workstreams (campsite booking, gear, food, car prep, and logistics). It doesn't match any existing project, so a new project is created with sections for the distinct workstreams mentioned.",
      confidence: 0.86,
      targetProjectId: null,
      project: { name: 'Big Sur Camping Trip' },
      sections: [
        { ref: 'gear', name: 'Gear' },
        { ref: 'food', name: 'Food' },
        { ref: 'car', name: 'Car' }
      ],
      tasks: [
        { content: 'Book campsite reservation', priority: 1, due: 'today', sectionRef: null },
        { content: 'Check tent for holes and patch if needed', priority: 2, due: null, sectionRef: 'gear' },
        { content: 'Test lantern batteries', priority: 2, due: null, sectionRef: 'gear' },
        { content: 'Dig out sleeping bags from garage', priority: 4, due: null, sectionRef: 'gear' },
        { content: 'Plan meals for three days', priority: 2, due: null, sectionRef: 'food' },
        { content: 'Buy propane for stove', priority: 2, due: null, sectionRef: 'food' },
        {
          content: 'Pack the cooler',
          priority: 2,
          due: null,
          sectionRef: 'food',
          subtasks: [
            { content: 'Get ice', priority: 2, due: null },
            { content: 'Get drinks', priority: 2, due: null },
            { content: 'Get stuff for burgers', priority: 2, due: null }
          ]
        },
        { content: 'Check tire pressure', priority: 2, due: null, sectionRef: 'car' },
        { content: 'Pack first aid kit', priority: 1, due: null, sectionRef: 'car' },
        { content: 'Download offline maps', priority: 2, due: null, sectionRef: null },
        { content: 'Let the dog sitter know the exact dates', priority: 2, due: null, sectionRef: null }
      ],
      needsClarification: false,
      clarificationQuestion: null
    }
  },
  {
    transcript:
      'Couple of unrelated things on my mind. Fix the leaky faucet. Also start learning Spanish. And renew my passport.',
    response: {
      decision: 'tasks',
      reasoning: 'Three unrelated intentions, so keep them as separate tasks rather than forcing one project.',
      confidence: 0.83,
      targetProjectId: null,
      project: null,
      tasks: [
        { content: 'Fix the leaky faucet', priority: 1, due: null, subtasks: [] },
        { content: 'Start learning Spanish', priority: 1, due: null, subtasks: [] },
        { content: 'Renew my passport', priority: 1, due: null, subtasks: [] }
      ],
      needsClarification: false,
      clarificationQuestion: null
    }
  },
  {
    transcript:
      "I'm planning our Q3 conference. For the venue side I need to book the hall and confirm catering. For speakers I need to confirm the keynote and finalize the agenda. For marketing I need to design the flyer and send the email blast.",
    response: {
      decision: 'project',
      reasoning: 'One coherent effort with three distinct workstreams, so sections separate them clearly.',
      confidence: 0.86,
      targetProjectId: null,
      project: { name: 'Q3 Conference' },
      sections: [
        { ref: 'venue', name: 'Venue' },
        { ref: 'speakers', name: 'Speakers' },
        { ref: 'marketing', name: 'Marketing' }
      ],
      tasks: [
        { content: 'Book the hall', priority: 2, due: null, sectionRef: 'venue', subtasks: [] },
        { content: 'Confirm catering', priority: 2, due: null, sectionRef: 'venue', subtasks: [] },
        { content: 'Confirm the keynote', priority: 1, due: null, sectionRef: 'speakers', subtasks: [] },
        { content: 'Finalize the agenda', priority: 1, due: null, sectionRef: 'speakers', subtasks: [] },
        { content: 'Design the flyer', priority: 3, due: null, sectionRef: 'marketing', subtasks: [] },
        { content: 'Send the email blast', priority: 3, due: null, sectionRef: 'marketing', subtasks: [] }
      ],
      needsClarification: false,
      clarificationQuestion: null
    }
  }
];

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`Seeding ${SEED_EXAMPLES.length} reference example(s) into Firestore's referenceExamples/ collection.`);

  if (dryRun) {
    console.log('--dry-run: not writing anything. Examples that would be seeded:');
    SEED_EXAMPLES.forEach((ex, i) => {
      console.log(`  ${i + 1}. ${ex.transcript.slice(0, 70)}...`);
    });
    return;
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'super-ramble' });
  const db = admin.firestore();
  const col = db.collection('referenceExamples');

  const ids = [];
  for (const ex of SEED_EXAMPLES) {
    const ref = await col.add({
      transcript: ex.transcript,
      response: ex.response,
      source: 'seed',
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      promotedFromTraceId: null,
      notes: null
    });
    ids.push(ref.id);
    console.log(`  wrote ${ref.id}`);
  }

  console.log(`\nDone. ${ids.length} document(s) written: ${ids.join(', ')}`);
  console.log('Confirm the count in the Firestore console or via a quick read before trusting it.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
