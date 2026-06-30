// The structuring core: transcript + existing projects -> proposed scaffold
// plus one-line reasoning. This is the novel work of super-ramble. Voice is a
// thin input adapter upstream of this; everything important happens here.
//
// The model call is injected (callModel) so the same code path runs three ways:
//   - offline evals: callModel returns a fixture's mocked response (no credits)
//   - local live:    callModel hits the Vite dev bridge
//   - production:     callModel hits the /api Function
// The UI never calls the model directly. See docs/architecture.md.

import { validateStructure } from './contracts.js';

export class ContractError extends Error {
  constructor(errors) {
    super(`structuring response failed contract: ${errors.join('; ')}`);
    this.name = 'ContractError';
    this.errors = errors;
  }
}

/**
 * @param {Object} args
 * @param {string} args.transcript
 * @param {{ id: string, name: string }[]} [args.existingProjects]
 * @param {(input: { transcript: string, existingProjects: object[] }) => Promise<object|string>} args.callModel
 * @returns {Promise<object>} the validated structuring result
 */
export async function structureTranscript({ transcript, existingProjects = [], callModel }) {
  if (typeof callModel !== 'function') {
    throw new Error('structureTranscript requires a callModel function');
  }

  const raw = await callModel({ transcript, existingProjects });
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new ContractError(['response was not valid JSON']);
  }

  const existingProjectIds = existingProjects.map((p) => p.id);
  const { valid, errors } = validateStructure(parsed, { existingProjectIds });
  if (!valid) {
    throw new ContractError(errors);
  }

  return parsed;
}
