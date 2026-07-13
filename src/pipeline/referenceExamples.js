// Curated worked examples injected into the live Structure prompt, so the
// real model call sees examples of good structuring, not just written rules
// in SYSTEM_PROMPT. Distinct from evals/fixtures/*.json: fixtures test the
// pipeline's own plumbing (offline, mocked, no real call); this array teaches
// the live model. See docs/llm-pipeline.md, Stage 2.
//
// Each entry's transcript and response are copied verbatim from an existing
// fixture (transcript / mockResponse), not retyped, so this stays real,
// hand-verified data:
//   - 01-clear-single-project.json:  one clean project with nested sub-tasks
//   - 08-big-sur-camping-trip.json:  a real multi-section trip, the
//     priority-corrected version (docs/resolution-log.md, 2026-07-08), not
//     the raw buggy trace
//   - 06-no-mega-restructure.json:   a restraint example, unrelated items
//     that must NOT become a project
//   - 07-sections-when-they-help.json: a project where sections earn their
//     keep
//
// This file must be kept in sync by hand with functions/referenceExamples.js:
// Firebase Functions deploys only the functions/ directory and cannot import
// this ESM module, the same constraint that already forces
// src/pipeline/prompt.js and functions/index.js's STRUCTURE_SYSTEM_PROMPT to
// be hand-synced (docs/resolution-log.md, 2026-07-06). scripts/check-prompt-sync.mjs
// diffs both copies and fails CI if they drift; don't let this duplication
// rot silently a fourth time.

export const REFERENCE_EXAMPLES = [
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
        { content: 'Pack first aid kit', priority: 3, due: null, sectionRef: 'car' },
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

/** One line describing what an example is, for its label in the prompt block. */
function describeExample(ex) {
  if (ex.response.decision === 'tasks') return 'tasks, no project';
  const name = ex.response.project && ex.response.project.name;
  return name ? `project: ${name}` : 'project';
}

/**
 * Format REFERENCE_EXAMPLES into a labeled prompt block. Marked plainly as
 * past, historical reference material so it is never confused with the
 * actual transcript being structured this call: this matters for
 * src/pipeline/contracts.js's isGroundedInTranscript no-invention guard,
 * which only ever checks a response's content against the real transcript
 * argument passed to structureTranscript, never against this block, but a
 * clearly labeled block also keeps the model itself from drawing on these
 * examples' own wording as if it were live user data.
 * @param {{ transcript: string, response: object }[]} examples
 * @returns {string}
 */
export function formatReferenceExamples(examples) {
  const blocks = examples.map((ex, i) =>
    [
      `Example ${i + 1} (${describeExample(ex)})`,
      `TRANSCRIPT: ${ex.transcript}`,
      `RESPONSE: ${JSON.stringify(ex.response)}`
    ].join('\n')
  );

  return [
    'PAST REFERENCE EXAMPLES',
    "The examples below are worked examples from prior sessions, shown only to illustrate the structuring conventions above: how nested sub-tasks come from dependent steps, when sections earn their keep, and when the right call is loose tasks instead of a project. They are historical reference material, not the current user's transcript. Never route content to them, never copy their wording into the response, and never treat anything in them as something the current user said. Ground every fact in the real TRANSCRIPT that follows this block.",
    '',
    blocks.join('\n\n')
  ].join('\n');
}
