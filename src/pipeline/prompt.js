// Haiku prompt builder for the structuring step.
//
// The user's existing project list is injected directly into the prompt
// (names plus ids, for routing). No RAG. This echoes how Ramble injects
// projects and labels into context. Temperature stays low so the model
// captures the dump literally and structures it, without inventing tasks
// or doing the work. See docs/llm-pipeline.md.
//
// First pass: this builds a real, readable prompt. The exact wording is
// tuned against live evals once the contract is stable (see docs/roadmap.md).

export const SYSTEM_PROMPT = [
  'You organize a voice brain-dump into Todoist structure. You do not do the work described.',
  'Decide one of two shapes:',
  '- "project": the dump describes one coherent effort. Synthesize a project with nested sub-tasks.',
  '- "tasks": the dump is loose, unrelated items. Return flat tasks, no new project.',
  'Capture only what the transcript says. Never invent a task that is not in the transcript.',
  'If the dump clearly belongs in an existing project, route to it by id instead of creating one.',
  'If the dump is genuinely ambiguous, set needsClarification and ask one short question.',
  'Do not collapse unrelated items into one mega-project.',
  'Return strict JSON matching the contract. No prose outside the JSON.'
].join('\n');

/**
 * Build the user prompt for one structuring call.
 * @param {{ transcript: string, existingProjects: { id: string, name: string }[] }} input
 * @returns {string}
 */
export function buildUserPrompt({ transcript, existingProjects = [] }) {
  const projectList = existingProjects.length
    ? existingProjects.map((p) => `- ${p.name} (id: ${p.id})`).join('\n')
    : '(none)';

  return [
    'EXISTING PROJECTS (for routing only, names and ids):',
    projectList,
    '',
    'TRANSCRIPT:',
    transcript.trim(),
    '',
    'Return the structuring JSON now.'
  ].join('\n');
}

/**
 * Assemble the full message payload for the model call.
 * @param {{ transcript: string, existingProjects: { id: string, name: string }[] }} input
 */
export function buildMessages(input) {
  return {
    system: SYSTEM_PROMPT,
    temperature: 0,
    messages: [{ role: 'user', content: buildUserPrompt(input) }]
  };
}
