// Haiku prompt builder for the structuring step.
//
// The user's existing project list is injected directly into the prompt
// (names plus ids, for routing). No RAG. This echoes how Ramble injects
// projects and labels into context. Temperature stays low so the model
// captures what the user said literally and structures it, without
// inventing tasks or doing the work. See docs/llm-pipeline.md.
//
// The live call passes a JSON Schema through output_config.format
// (functions/index.js), so the API constrains the response shape directly.
// This system prompt only states real behavioral instructions; it no longer
// asks for "strict JSON, no prose", since the schema already guarantees that.
// This text must be kept in sync with functions/index.js's own copy: Firebase
// Functions deploys only the functions/ directory, so it cannot import this
// ESM module. See docs/resolution-log.md.
//
// A curated set of worked examples (src/pipeline/referenceExamples.js) is
// appended below the rules, so the live model sees real structuring
// examples, not just written instructions. See docs/llm-pipeline.md, Stage 2.

import { REFERENCE_EXAMPLES, formatReferenceExamples } from './referenceExamples.js';

const STRUCTURING_RULES = [
  'You turn what someone rambled into Todoist structure. You do not do the work they described.',
  'Decide one of two shapes:',
  '- "project": what they said describes one coherent effort. Synthesize a project with nested sub-tasks.',
  '- "tasks": what they said is loose, unrelated items. Return flat tasks, no new project.',
  'Capture only what the transcript says. Never invent a task that is not in the transcript.',
  'If what they said clearly belongs to an existing project, route to it by id instead of creating one.',
  'Do not collapse unrelated items into one mega-project.',
  'Report your confidence in the decision as a number from 0 to 1. When you are not confident it is a coherent project, lean toward "tasks" instead of inventing a "project" structure that might not fit.',
  'needsClarification is for routing uncertainty only, never for uncertainty about whether something is project-shaped, those are two different questions. "Is this a coherent project or loose tasks" is answered by confidence and the "tasks" fallback above, never by a question to the user. "Does this belong to something that already exists" is the one worth asking about, and only when genuinely unclear: could this new content extend one of existingProjects, or is it clearly its own new thing, or (when two existingProjects share a name) which one it means. When content is clearly new and unrelated to every existingProjects entry, propose the new project confidently, no question first: the user still reviews and confirms before anything is written.',
  'Write reasoning the way a person would describe what they heard: plain language about their actual plans or errands. Never refer to "the dump" or "the transcript" as if reasoning were describing an input variable; describe the content itself.',
  'Add sections only when what they said names distinct workstreams that benefit from separation. Most need none; do not force a single-thread project into sections. Give each section a local ref and a name, and give a task a sectionRef only when it names one of those sections.',
  'Priority runs 1 to 4, and 1 is the most urgent, the red flag, while 4 means no priority at all, the default when nothing in the transcript signals urgency. Map "urgent," "ASAP," "important," "that one is critical," or a task tied to a near, named deadline toward 1. Map "not urgent," "no rush," or "whenever" toward 4. Get the direction right: the more urgent the words, the lower the number. "Important" carries the same weight as "urgent," not a softer one: a task the speaker calls out as important gets priority 1 too, not quietly downgraded to 2 or 3 just because the word itself reads gentler than "urgent" in everyday English.',
  'Never reference an internal id in clarificationQuestion, or anywhere else a person reads. An id like "ARW606qp9EbPUAPK1Ypa" means nothing to a user; there is no way for them to answer a question that asks them to choose one. If two or more existingProjects share the same name and routing is genuinely ambiguous, ask the user to disambiguate in their own words instead: a distinguishing detail they would know (what it is for, roughly when they made it), or simply note that two projects share that name and ask which one they mean. Never resolve that ambiguity by stating an id.'
].join('\n');

export const SYSTEM_PROMPT = [STRUCTURING_RULES, '', formatReferenceExamples(REFERENCE_EXAMPLES)].join('\n');

/**
 * Build the user prompt for one structuring call. When priorErrors is set,
 * this is the corrective retry: the errors are appended so the model can fix
 * them instead of the caller guessing at a repair. See src/pipeline/structure.js.
 * @param {{ transcript: string, existingProjects: { id: string, name: string }[], priorErrors?: string[] | null }} input
 * @returns {string}
 */
export function buildUserPrompt({ transcript, existingProjects = [], priorErrors = null }) {
  const projectList = existingProjects.length
    ? existingProjects.map((p) => `- ${p.name} (id: ${p.id})`).join('\n')
    : '(none)';

  const lines = [
    'EXISTING PROJECTS (for routing only, names and ids):',
    projectList,
    '',
    'TRANSCRIPT:',
    transcript.trim(),
    ''
  ];

  if (priorErrors && priorErrors.length) {
    lines.push(
      'Your previous response failed validation for these reasons:',
      priorErrors.map((e) => `- ${e}`).join('\n'),
      'Correct every issue and return a full, corrected response.',
      ''
    );
  }

  lines.push('Return the structuring JSON now.');
  return lines.join('\n');
}

/**
 * Assemble the full message payload for the model call.
 * @param {{ transcript: string, existingProjects: { id: string, name: string }[], priorErrors?: string[] | null }} input
 */
export function buildMessages(input) {
  return {
    system: SYSTEM_PROMPT,
    temperature: 0,
    messages: [{ role: 'user', content: buildUserPrompt(input) }]
  };
}
