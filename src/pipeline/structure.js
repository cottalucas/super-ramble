// The structuring core: transcript + existing projects -> proposed scaffold
// plus one-line reasoning. This is the novel work of super-ramble. Voice is a
// thin input adapter upstream of this; everything important happens here.
//
// The model call is injected (callModel) so the same code path runs three ways:
//   - offline evals: callModel returns a fixture's mocked response (no credits)
//   - local live:    callModel hits the Vite dev bridge
//   - production:     callModel hits the /api Function
// The UI never calls the model directly. See docs/architecture.md.
//
// The live call constrains the response shape with a JSON Schema
// (functions/index.js), so validateStructure below only has to check what a
// schema cannot: sectionRef and targetProjectId actually resolve, decision
// and project stay coherent, numbers sit in their real range, and no content
// is invented. One corrective retry: if the first attempt fails either check,
// callModel is invoked again with the errors appended so the model can fix
// them; a second failure fails closed, no partial or guessed structure. See
// docs/resolution-log.md.

import { validateStructure, ungroundedContents } from './contracts.js';

export class ContractError extends Error {
  constructor(errors) {
    super(`structuring response failed contract: ${errors.join('; ')}`);
    this.name = 'ContractError';
    this.errors = errors;
  }
}

async function attempt(callModel, transcript, existingProjects, existingProjectIds, priorErrors) {
  const raw = await callModel({ transcript, existingProjects, priorErrors: priorErrors || null });
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { errors: ['response was not valid JSON'] };
  }

  const { valid, errors } = validateStructure(parsed, { existingProjectIds });
  if (!valid) return { errors };

  const ungrounded = ungroundedContents(parsed, transcript);
  if (ungrounded.length) {
    return { errors: [`invented content not in the transcript: ${ungrounded.join(', ')}`] };
  }

  return { parsed };
}

/**
 * @param {Object} args
 * @param {string} args.transcript
 * @param {{ id: string, name: string }[]} [args.existingProjects]
 * @param {(input: { transcript: string, existingProjects: object[], priorErrors: string[] | null }) => Promise<object|string>} args.callModel
 * @returns {Promise<object>} the validated structuring result
 */
export async function structureTranscript({ transcript, existingProjects = [], callModel }) {
  if (typeof callModel !== 'function') {
    throw new Error('structureTranscript requires a callModel function');
  }

  const existingProjectIds = existingProjects.map((p) => p.id);

  const first = await attempt(callModel, transcript, existingProjects, existingProjectIds, null);
  if (first.parsed) return first.parsed;

  const retry = await attempt(callModel, transcript, existingProjects, existingProjectIds, first.errors);
  if (retry.parsed) return retry.parsed;

  throw new ContractError(retry.errors);
}
