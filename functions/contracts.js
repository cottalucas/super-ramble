// Mirrors src/pipeline/contracts.js exactly, byte for byte on every function
// body. Firebase Functions deploys only this functions/ directory as its own
// CommonJS package, so it cannot import the ESM module at ../src/pipeline:
// the same constraint that already forces STRUCTURE_SYSTEM_PROMPT_RULES in
// functions/index.js to be a hand-synced copy of src/pipeline/prompt.js's
// rules text (docs/resolution-log.md, 2026-07-06). scripts/check-prompt-sync.mjs
// diffs both copies of this file's exported functions (by running each
// against the same probe cases) and fails CI if they drift. Edit
// src/pipeline/contracts.js first, then copy the exact same change here; do
// not edit only one copy.
//
// Needed for the auto-promotion trigger (functions/index.js's
// onDocumentWritten on structureTraces): before writing a corrected tree
// into referenceExamples, it runs the same validateStructure/grounding
// check scripts/promote-trace.mjs already runs before writing an offline
// fixture, so a bad reconstruction can't quietly teach the live model
// something wrong. Only validateStructure, allContents,
// isGroundedInTranscript, and ungroundedContents are needed here (not
// DECISIONS, exported from the src/ copy for evals/offline/contract-cases.mjs's
// own use, which functions/ has no equivalent of).

const DECISIONS = Object.freeze(['project', 'tasks']);

// Allowed keys at each level. Anything else is an out-of-contract field.
const TOP_KEYS = [
  'decision',
  'reasoning',
  'confidence',
  'targetProjectId',
  'project',
  'sections',
  'tasks',
  'needsClarification',
  'clarificationQuestion'
];
const PROJECT_KEYS = ['name'];
const SECTION_KEYS = ['ref', 'name'];
const TASK_KEYS = ['content', 'priority', 'due', 'subtasks', 'sectionRef', 'standalone'];
const SUBTASK_KEYS = ['content', 'priority', 'due'];

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

function isPriority(p) {
  // Todoist priority is 1 (urgent, p1/red, highest) to 4 (none, the default).
  return Number.isInteger(p) && p >= 1 && p <= 4;
}

function isDue(d) {
  // Due is an optional human or ISO string, or null when not implied.
  return d === null || typeof d === 'string';
}

function isConfidence(c) {
  return typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1;
}

/**
 * Validate a structuring response against the contract.
 * @param {any} obj
 * @param {{ existingProjectIds?: string[] }} [opts]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateStructure(obj, opts = {}) {
  const errors = [];
  const existingProjectIds = opts.existingProjectIds || null;

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['response must be an object'] };
  }

  for (const k of unknownKeys(obj, TOP_KEYS)) {
    errors.push(`out-of-contract field: ${k}`);
  }

  if (!DECISIONS.includes(obj.decision)) {
    errors.push(`decision must be one of ${DECISIONS.join(' | ')}`);
  }

  if (typeof obj.reasoning !== 'string' || obj.reasoning.trim() === '') {
    errors.push('reasoning must be a non-empty string');
  }

  if (!isConfidence(obj.confidence)) {
    errors.push('confidence must be a number between 0 and 1');
  }

  if (!('targetProjectId' in obj) || !(obj.targetProjectId === null || typeof obj.targetProjectId === 'string')) {
    errors.push('targetProjectId must be a string or null');
  } else if (
    existingProjectIds &&
    typeof obj.targetProjectId === 'string' &&
    !existingProjectIds.includes(obj.targetProjectId)
  ) {
    errors.push(`targetProjectId ${obj.targetProjectId} is not an existing project`);
  }

  // project: object with only a name, or null.
  if (obj.project !== null && obj.project !== undefined) {
    if (typeof obj.project !== 'object' || Array.isArray(obj.project)) {
      errors.push('project must be an object or null');
    } else {
      for (const k of unknownKeys(obj.project, PROJECT_KEYS)) {
        errors.push(`out-of-contract field: project.${k}`);
      }
      if (typeof obj.project.name !== 'string' || obj.project.name.trim() === '') {
        errors.push('project.name must be a non-empty string');
      }
    }
  }

  // decision/project coherence.
  if (obj.decision === 'project' && !(obj.project || obj.targetProjectId)) {
    errors.push('decision "project" needs a project or a targetProjectId');
  }
  if (obj.decision === 'tasks' && obj.project) {
    errors.push('decision "tasks" must not synthesize a new project');
  }

  // sections: optional. Present only when the dump names distinct workstreams.
  let sectionRefs = null;
  if (obj.sections !== undefined) {
    if (!Array.isArray(obj.sections)) {
      errors.push('sections must be an array');
    } else {
      sectionRefs = new Set();
      obj.sections.forEach((s, i) => {
        const path = `sections[${i}]`;
        if (s === null || typeof s !== 'object' || Array.isArray(s)) {
          errors.push(`${path} must be an object`);
          return;
        }
        for (const k of unknownKeys(s, SECTION_KEYS)) {
          errors.push(`out-of-contract field: ${path}.${k}`);
        }
        if (typeof s.ref !== 'string' || s.ref.trim() === '') {
          errors.push(`${path}.ref must be a non-empty string`);
        } else if (sectionRefs.has(s.ref)) {
          errors.push(`${path}.ref "${s.ref}" is not unique`);
        } else {
          sectionRefs.add(s.ref);
        }
        if (typeof s.name !== 'string' || s.name.trim() === '') {
          errors.push(`${path}.name must be a non-empty string`);
        }
      });
    }
  }

  if (!Array.isArray(obj.tasks)) {
    errors.push('tasks must be an array');
  } else {
    obj.tasks.forEach((t, i) => validateTask(t, `tasks[${i}]`, errors, sectionRefs));
    // decision "tasks" is already the loose-tasks shape: everything in it is
    // already outside any project, so there is nothing for standalone to
    // mark this task apart from.
    if (obj.decision === 'tasks' && obj.tasks.some((t) => t && t.standalone === true)) {
      errors.push('decision "tasks" must not carry a standalone task; everything is already loose');
    }
  }

  if (typeof obj.needsClarification !== 'boolean') {
    errors.push('needsClarification must be a boolean');
  }
  if (!('clarificationQuestion' in obj) || !(obj.clarificationQuestion === null || typeof obj.clarificationQuestion === 'string')) {
    errors.push('clarificationQuestion must be a string or null');
  }
  if (obj.needsClarification === true && !obj.clarificationQuestion) {
    errors.push('needsClarification true requires a clarificationQuestion');
  }

  return { valid: errors.length === 0, errors };
}

function validateTask(t, path, errors, sectionRefs) {
  if (t === null || typeof t !== 'object' || Array.isArray(t)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const k of unknownKeys(t, TASK_KEYS)) {
    errors.push(`out-of-contract field: ${path}.${k}`);
  }
  if (typeof t.content !== 'string' || t.content.trim() === '') {
    errors.push(`${path}.content must be a non-empty string`);
  }
  if (!isPriority(t.priority)) {
    errors.push(`${path}.priority must be an integer 1-4`);
  }
  if (!isDue(t.due)) {
    errors.push(`${path}.due must be a string or null`);
  }
  if (t.sectionRef !== undefined && t.sectionRef !== null) {
    if (typeof t.sectionRef !== 'string') {
      errors.push(`${path}.sectionRef must be a string or null`);
    } else if (!sectionRefs || !sectionRefs.has(t.sectionRef)) {
      errors.push(`${path}.sectionRef "${t.sectionRef}" does not match any declared section`);
    }
  }
  if (t.standalone !== undefined && typeof t.standalone !== 'boolean') {
    errors.push(`${path}.standalone must be a boolean`);
  }
  if (t.standalone === true && t.sectionRef !== undefined && t.sectionRef !== null) {
    errors.push(`${path}.standalone task must not also carry a sectionRef, it is leaving the project's own sections entirely`);
  }
  if (t.subtasks !== undefined) {
    if (!Array.isArray(t.subtasks)) {
      errors.push(`${path}.subtasks must be an array`);
    } else {
      t.subtasks.forEach((s, i) => validateSubtask(s, `${path}.subtasks[${i}]`, errors));
    }
  }
}

function validateSubtask(s, path, errors) {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const k of unknownKeys(s, SUBTASK_KEYS)) {
    errors.push(`out-of-contract field: ${path}.${k}`);
  }
  if (typeof s.content !== 'string' || s.content.trim() === '') {
    errors.push(`${path}.content must be a non-empty string`);
  }
  if (!isPriority(s.priority)) {
    errors.push(`${path}.priority must be an integer 1-4`);
  }
  if (!isDue(s.due)) {
    errors.push(`${path}.due must be a string or null`);
  }
}

/** Flatten every task and subtask content string for the no-invention guard. */
function allContents(obj) {
  const out = [];
  for (const t of obj.tasks || []) {
    if (t && typeof t.content === 'string') out.push(t.content);
    for (const s of t?.subtasks || []) {
      if (s && typeof s.content === 'string') out.push(s.content);
    }
  }
  return out;
}

function normalizeForGrounding(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * A content is grounded if some meaningful token (4+ chars) of it appears in
 * the transcript. Catches invented tasks a schema cannot: shape validation
 * says nothing about whether the words were actually in the dump.
 */
function isGroundedInTranscript(content, transcript) {
  const t = normalizeForGrounding(transcript);
  const tokens = normalizeForGrounding(content)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  if (tokens.length === 0) return true; // very short content, skip
  return tokens.some((w) => t.includes(w));
}

/** Every produced content string not grounded in the transcript, or []. */
function ungroundedContents(obj, transcript) {
  return allContents(obj).filter((c) => !isGroundedInTranscript(c, transcript));
}

module.exports = { validateStructure, allContents, isGroundedInTranscript, ungroundedContents };
