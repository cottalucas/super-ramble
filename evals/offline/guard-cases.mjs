// Guard cases for structureTranscript itself, not just validateStructure.
// These exercise the retry-then-fail-closed path in src/pipeline/structure.js
// with a raw, non-object callModel response (a string), the same shape a
// truncated live call returns. No fixture ever hits this path (every
// mockResponse is already a parsed object), so before this file the JSON.parse
// branch in structure.js's attempt() had zero offline coverage. Added after a
// live call against a rich multi-section dump came back "model response was
// not valid JSON" with no offline case to catch it. See
// docs/resolution-log.md, 2026-07-07.

export const guardCases = [
  {
    id: 'guard-malformed-json-fails-closed',
    describe: 'A raw non-JSON response (e.g. truncated output) retries once, then fails closed.',
    // Not valid JSON on either attempt, the same as a mid-object truncation.
    rawResponses: ['{"decision": "project", "tasks": [', '{"decision": "project", "tasks": ['],
    expectRetryCount: 2,
    expectErrorContains: 'response was not valid JSON'
  }
];
