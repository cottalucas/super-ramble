// /api proxy. The browser never holds a secret and never calls the model or
// Todoist directly. It calls same-origin /api/**, this Function verifies the
// Firebase Auth token, reads secrets, enforces per-user daily limits, proxies
// the model and Todoist calls, and logs privacy-safe usage. See docs/architecture.md.
//
// The structuring call is real (Anthropic Messages API, structured outputs).
// Transcribe is real too (Groq's hosted Whisper Large v3 Turbo, POST
// /api/transcribe). Todoist OAuth connect and the batched, new-project-only
// Todoist write are real too now (docs/roadmap.md, phase 3 part 8). This is
// not sync: it is a second, independent write of the same confirmed tree
// alongside the local store.createProjectTree write, at the same Confirm
// click. After that write the local copy and the Todoist copy have no
// relationship; editing one never touches the other. Every real structuring
// call, success or failure, also persists to users/{uid}/structureTraces,
// and POST /api/structure/outcome records the user's own confirmed/cancelled
// decision on it. Transcribe gets no such trace collection, a deliberate
// scope decision; see docs/llm-pipeline.md.
// See docs/architecture.md, docs/llm-pipeline.md, and the resolution log
// entries dated 2026-07-07, 2026-07-08, and the Todoist OAuth entry below.
//
// Firebase Functions deploys only this functions/ directory as its own
// CommonJS package, so it cannot import the ESM modules under ../src/pipeline.
// STRUCTURE_JSON_SCHEMA and STRUCTURE_SYSTEM_PROMPT below are therefore this
// app's one deliberate, flagged duplication: they must be kept in sync by
// hand with src/pipeline/contracts.js and src/pipeline/prompt.js. See
// docs/resolution-log.md. Everything a schema cannot check (sectionRef and
// targetProjectId resolution, decision/project coherence, invented content)
// still runs exactly once, client-side, in src/pipeline/structure.js.

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');
const { buildSyncCommands, isTokenExpired } = require('./todoist.js');
const { validateStructure, ungroundedContents } = require('./contracts.js');

admin.initializeApp();
const db = admin.firestore();

// Secrets are set with: firebase functions:secrets:set <NAME>
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const TODOIST_CLIENT_SECRET = defineSecret('TODOIST_CLIENT_SECRET');
const GROQ_API_KEY = defineSecret('GROQ_API_KEY');

// Pinned config. Haiku is the default for every model call in this app.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// Deliberate, named exception to Haiku-by-default: docs/brief.md's "the
// structure has to be genuinely good" constraint (a bad scaffold is worse
// than none) makes structuring quality worth paying for. This is the one
// call in this app that runs on Sonnet; every other model call stays on
// Haiku. claude-sonnet-5 verified as the current Sonnet API id against
// platform.claude.com/docs/en/about-claude/models/overview: a pinned
// snapshot, not an evergreen alias, same as every other Claude model id.
const ANTHROPIC_STRUCTURE_MODEL = process.env.ANTHROPIC_STRUCTURE_MODEL || 'claude-sonnet-5';

// Sonnet list pricing verified against the same models page: $3 / MTok in,
// $15 / MTok out, roughly 3x Haiku's $1 / $5. An introductory $2 / $10 rate
// applies through 2026-08-31; costUsd deliberately uses the standard rate
// so the daily spend guard stays conservative once that window ends rather
// than quietly under-counting today. See docs/resolution-log.md for the
// limit sizing this feeds into.
const STRUCTURE_INPUT_USD_PER_MTOK = 3;
const STRUCTURE_OUTPUT_USD_PER_MTOK = 15;

const DAILY_REQUEST_LIMIT = Number(process.env.LLM_DAILY_REQUEST_LIMIT || 100);
const DAILY_COST_LIMIT_USD = Number(process.env.LLM_DAILY_COST_LIMIT_USD || 4);
const STORE_RAW_TRACES = process.env.LLM_STORE_RAW_TRACES === 'true';

// Stage 1 (Transcribe): Groq's hosted Whisper Large v3 Turbo, an
// OpenAI-compatible transcription API. Model id and endpoint verified live
// against console.groq.com/docs/speech-to-text, the same discipline
// ANTHROPIC_STRUCTURE_MODEL already follows for its own model id. Recorded
// then transcribed, not streamed: one clip, one call. See
// docs/llm-pipeline.md, Stage 1, and docs/resolution-log.md.
const GROQ_TRANSCRIBE_MODEL = process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Turbo pricing verified against the same page: $0.04/hour. Groq's own
// stated minimum billable duration is 10 seconds; costUsd bills at least
// that much per call so this app's own estimate never under-counts what
// Groq will actually charge.
const GROQ_TRANSCRIBE_USD_PER_HOUR = 0.04;
const GROQ_MIN_BILLABLE_SECONDS = 10;

// Todoist endpoints, verified live against developer.todoist.com/api/v1
// before writing any of the handlers below (see the resolution log entries
// dated 2026-06-30 and the Todoist OAuth entry). The unified v1 API, not the
// archived v6 Sync API or the deprecating rest/v2 or sync/v9.
const TODOIST_TOKEN_URL = 'https://api.todoist.com/oauth/access_token';
const TODOIST_REVOKE_URL = 'https://api.todoist.com/api/v1/access_tokens';
const TODOIST_SYNC_URL = 'https://api.todoist.com/api/v1/sync';
// Legacy Todoist apps (refresh tokens not enabled) return a 10-year
// compatibility value instead of a real expires_in; used only if a response
// is ever missing the field outright, so a token is never treated as living
// forever by silent assumption.
const TODOIST_LEGACY_EXPIRES_IN_SECONDS = 315360000;

// Five minutes: a voice brain-dump beyond this is reaching for a different
// tool than "ramble, then organize" (docs/brief.md's "capture stays
// deliberately simple"). Well under Groq's own 25MB free-tier file-size
// cap regardless: a 5-minute browser recording at typical voice bitrates is
// a few MB at most, so product framing is the real binding constraint here,
// not file size.
const TRANSCRIBE_MAX_DURATION_SECONDS = 300;

// 10MB decoded audio, comfortably above any real recording at the duration
// cap above, comfortably under Groq's own 25MB free-tier limit even after
// the ~33% size inflation of base64-encoding it for this JSON request body.
const TRANSCRIBE_MAX_BYTES = 10 * 1024 * 1024;

// Groq's supported-format list uses file extensions to infer the codec;
// MediaRecorder's mimeType varies by browser (webm in Chrome/Firefox, mp4 in
// Safari). Falls back to webm, the most common case, if the mimeType is
// missing or unrecognized.
function extensionForMimeType(mimeType) {
  const map = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac'
  };
  const base = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return map[base] || 'webm';
}

// Mirrors src/pipeline/prompt.js's SYSTEM_PROMPT exactly (minus nothing; the
// "strict JSON, no prose" line was dropped from both, since output_config.format
// below already guarantees the shape). Keep the two in sync by hand.
const STRUCTURE_SYSTEM_PROMPT_RULES = [
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

// Worked examples used to be a second hand-synced file
// (functions/referenceExamples.js, mirroring src/pipeline/referenceExamples.js).
// They now live in Firestore's referenceExamples/ collection instead, so
// every real call sees whatever the pool currently holds, including
// examples added automatically since the app last deployed, not a value
// frozen at build time. fetchReferenceExamples/formatReferenceExamples
// below assemble the same labeled block the old file-based version did, at
// request time, inside the /api/structure handler; there is no static
// STRUCTURE_SYSTEM_PROMPT constant anymore; STRUCTURE_SYSTEM_PROMPT_RULES
// above is still the whole hand-synced-with-src/pipeline/prompt.js half.
// See docs/llm-pipeline.md, Stage 2, and docs/resolution-log.md.

/** One line describing what an example is, for its label in the prompt block. */
function describeReferenceExample(ex) {
  if (ex.response.decision === 'tasks') return 'tasks, no project';
  const name = ex.response.project && ex.response.project.name;
  return name ? `project: ${name}` : 'project';
}

/**
 * Format a list of { transcript, response } reference examples into the
 * same labeled PAST REFERENCE EXAMPLES block the file-based version used to
 * produce. Marked plainly as historical reference material so it is never
 * confused with the current call's live transcript: this matters for
 * isGroundedInTranscript below, which only ever checks a response's content
 * against the real transcript argument for THIS call, never against
 * anything in this block.
 */
function formatReferenceExamples(examples) {
  const blocks = examples.map((ex, i) =>
    [
      `Example ${i + 1} (${describeReferenceExample(ex)})`,
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

// Ordered newest-first, capped at 30: a growing pool stays bounded (see the
// auto-promotion trigger below, which enforces the same 30 cap on write by
// deleting the oldest auto-promoted document, never a seed one), and
// newest-first means a recent correction is felt in the live prompt sooner
// than an old one would need to scroll into view. No composite index
// needed: a single-field orderBy on a top-level collection is auto-indexed.
async function fetchReferenceExamples() {
  const snap = await db.collection('referenceExamples').orderBy('addedAt', 'desc').limit(30).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return { transcript: data.transcript, response: data.response };
  });
}

// Mirrors src/pipeline/contracts.js's validateStructure exactly: same keys,
// same required/optional split (sections, a task's sectionRef and subtasks
// are all omittable). additionalProperties: false on every object matches
// contracts.js's out-of-contract-field rejection. Numeric ranges (confidence
// 0-1, priority 1-4) and cross-field coherence are not expressible in JSON
// Schema, so validateStructure still checks those client-side; see
// src/pipeline/structure.js.
const SUBTASK_SCHEMA = {
  type: 'object',
  properties: {
    content: { type: 'string' },
    priority: { type: 'integer' },
    due: { type: ['string', 'null'] }
  },
  required: ['content', 'priority', 'due'],
  additionalProperties: false
};

const STRUCTURE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    decision: { enum: ['project', 'tasks'] },
    reasoning: { type: 'string' },
    confidence: { type: 'number' },
    targetProjectId: { type: ['string', 'null'] },
    project: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false
        }
      ]
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          name: { type: 'string' }
        },
        required: ['ref', 'name'],
        additionalProperties: false
      }
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          priority: { type: 'integer' },
          due: { type: ['string', 'null'] },
          sectionRef: { type: ['string', 'null'] },
          subtasks: { type: 'array', items: SUBTASK_SCHEMA }
        },
        required: ['content', 'priority', 'due'],
        additionalProperties: false
      }
    },
    needsClarification: { type: 'boolean' },
    clarificationQuestion: { type: ['string', 'null'] }
  },
  required: [
    'decision',
    'reasoning',
    'confidence',
    'targetProjectId',
    'project',
    'tasks',
    'needsClarification',
    'clarificationQuestion'
  ],
  additionalProperties: false
};

// Mirrors src/pipeline/prompt.js's buildUserPrompt exactly, including the
// corrective-retry block appended when priorErrors is present.
function buildStructureUserPrompt({ transcript, existingProjects, priorErrors }) {
  const list = existingProjects.length
    ? existingProjects.map((p) => `- ${p.name} (id: ${p.id})`).join('\n')
    : '(none)';

  const lines = ['EXISTING PROJECTS (for routing only, names and ids):', list, '', 'TRANSCRIPT:', transcript.trim(), ''];

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

// Anthropic's structured-outputs docs guarantee the JSON lands in
// response.content[0].text on an ordinary end_turn; the only two documented
// exceptions are stop_reason "refusal" and "max_tokens". A 2026-07-07 live
// call hit neither exception yet still came back with an empty
// content[0].text, an unexplained case (see docs/resolution-log.md). This
// broadens the search rather than trusting index 0 alone: it concatenates
// every 'text' block in response.content, in order, so the JSON is still
// found if the API ever splits it across blocks or orders a non-text block
// first. For the ordinary single-text-block case this returns exactly what
// response.content[0]?.text did before. Not a fix for a confirmed root
// cause, a defensive broadening plus (via contentBlocks in
// logStructureTrace below) the visibility needed to find the real one if it
// recurs.
function extractStructuredText(contentBlocks) {
  return (contentBlocks || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Shape-checks POST /api/structure/outcome's optional edits payload before
// it ever reaches a Firestore write: { removedTasks: [{ content, priority,
// sectionRef }], projectNameChange: { from, to } | null, contentEdits:
// [{ originalContent, newContent }] }. Every field is optional (a client
// omits whichever category had nothing to report), but whatever is present
// must match this shape; this is the one client-writable field on
// structureTraces, so it gets the same discipline STRUCTURE_JSON_SCHEMA
// gives the model's own response. See docs/architecture.md.
function isValidEdits(edits) {
  if (edits == null || typeof edits !== 'object' || Array.isArray(edits)) return false;
  const { removedTasks, projectNameChange, contentEdits } = edits;

  if (removedTasks !== undefined) {
    if (!Array.isArray(removedTasks)) return false;
    for (const t of removedTasks) {
      if (!t || typeof t !== 'object') return false;
      if (typeof t.content !== 'string') return false;
      if (!Number.isInteger(t.priority) || t.priority < 1 || t.priority > 4) return false;
      if (t.sectionRef !== null && typeof t.sectionRef !== 'string') return false;
    }
  }

  if (projectNameChange !== undefined && projectNameChange !== null) {
    if (typeof projectNameChange !== 'object' || Array.isArray(projectNameChange)) return false;
    if (typeof projectNameChange.from !== 'string' || typeof projectNameChange.to !== 'string') return false;
  }

  if (contentEdits !== undefined) {
    if (!Array.isArray(contentEdits)) return false;
    for (const e of contentEdits) {
      if (!e || typeof e !== 'object') return false;
      if (typeof e.originalContent !== 'string' || typeof e.newContent !== 'string') return false;
    }
  }

  return true;
}

async function verifyAuth(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

// Per-user daily limits, read from users/{uid}/llmUsage/{YYYY-MM-DD}.
async function checkAndReserveLimit(uid) {
  const ref = db.doc(`users/${uid}/llmUsage/${today()}`);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : { requests: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
  if (data.requests >= DAILY_REQUEST_LIMIT) {
    return { allowed: false, reason: 'daily request limit reached' };
  }
  if (data.costUsd >= DAILY_COST_LIMIT_USD) {
    return { allowed: false, reason: 'daily cost limit reached' };
  }
  return { allowed: true, ref };
}

// Record privacy-safe usage. Raw prompts/responses are never stored here.
// audioSeconds is Transcribe's own duration counter; inputTokens/outputTokens
// don't apply to a transcription call, so it gets its own field rather than
// forcing token fields to carry duration data. Shared by both /structure and
// /transcribe: one daily ceiling (checkAndReserveLimit) across both, not a
// second parallel limit system.
async function logUsage(ref, { costUsd = 0, inputTokens = 0, outputTokens = 0, audioSeconds = 0 }) {
  const inc = admin.firestore.FieldValue.increment;
  await ref.set(
    {
      requests: inc(1),
      costUsd: inc(costUsd),
      inputTokens: inc(inputTokens),
      outputTokens: inc(outputTokens),
      audioSeconds: inc(audioSeconds),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

function endsWithPath(req, suffix) {
  return req.path === suffix || req.path.endsWith(suffix);
}

// Persists every real Structure call to users/{uid}/structureTraces, success
// or failure, in production too. Separate from LLM_STORE_RAW_TRACES (a
// transient debug console.log, still off in production); this is permanent,
// per-user persistence, on by default everywhere. Reopens what
// docs/architecture.md used to say about raw traces; see the resolution log
// entry dated 2026-07-07 for why: there is no other way to build a real
// golden dataset or know whether a proposal was actually good. A Firestore
// hiccup here must never turn a working structuring response into a 500 for
// the caller, so this is its own try/catch, called once per call.
//
// The primary write can still fail (a 2026-07-08 review found real,
// unexplained cases: users/{uid}/llmUsage counted more requests than
// users/{uid}/structureTraces had documents, meaning some real, paid calls
// left zero trace record). The catch below used to just console.error and
// return null, total silence beyond a log line nobody was watching. It now
// attempts one minimal fallback write instead: whatever caused the first
// write to fail might recur on a second, larger one, so the fallback carries
// no transcript or response, just enough to know a call happened and why its
// real trace is missing. If even that fails, there is genuinely nothing left
// to persist; that one case logs everything needed to diagnose it directly
// from Cloud Logging (error code, message, uid), since nothing else will
// ever record that this call happened.
async function logStructureTrace(uid, data) {
  try {
    const ref = await db.collection(`users/${uid}/structureTraces`).add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      outcome: 'pending',
      outcomeAt: null
    });
    return ref.id;
  } catch (err) {
    console.error('logStructureTrace failed', { uid, errorCode: err?.code ?? null, errorMessage: String(err?.message ?? err) });
    try {
      const fallbackRef = await db.collection(`users/${uid}/structureTraces`).add({
        ok: false,
        traceWriteFailed: true,
        errorCode: err?.code ?? null,
        errorMessage: String(err?.message ?? err),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        outcome: 'pending',
        outcomeAt: null
      });
      return fallbackRef.id;
    } catch (fallbackErr) {
      console.error('logStructureTrace fallback also failed', {
        uid,
        errorCode: fallbackErr?.code ?? null,
        errorMessage: String(fallbackErr?.message ?? fallbackErr)
      });
      return null;
    }
  }
}

// timeoutSeconds was unset, so this ran on firebase-functions v2's own
// default (60s). A rich, multi-thread transcript's /structure call (Sonnet,
// max_tokens: 8192, up to 30 reference examples formatted into the system
// prompt, fetchReferenceExamples above) can genuinely run past that: the
// platform kills the function mid-await, before logStructureTrace or any of
// the three deliberate 502 branches below ever run, so the failure reaches
// the browser as a bare, unexplained 502 with zero users/{uid}/structureTraces
// document to show for it. Confirmed live: docs/resolution-log.md, this
// entry's date. 120s comfortably covers a slow Structure call; HTTPS/onRequest
// functions in firebase-functions v5 allow up to 3,600s
// (node_modules/firebase-functions/lib/v2/options.d.ts's own doc comment),
// so this is nowhere close to that ceiling.
//
// This alone does not fully close the live bug. Firebase Hosting's own
// /api/** rewrite (firebase.json) proxies to this function, and Hosting
// enforces its own separate, hard, non-configurable 60-second request
// timeout: past that, Hosting itself returns a 504 before this function's
// own timeoutSeconds is ever consulted, confirmed directly against
// firebase.google.com/docs/hosting/functions ("Even if you configure your
// HTTPS function with a longer request timeout, you'll still receive an
// HTTPS status code 504 ... if your function requires more than 60 seconds
// to run"). Every real browser call goes through that same rewrite
// (docs/architecture.md: "The browser ... calls same-origin /api/**"), so a
// Structure call that genuinely takes longer than 60 seconds can still fail
// silently for a real user after this change, just as a 504 sourced from
// Hosting's proxy instead of a 502 sourced from a killed Cloud Function. This
// is a real, separate, unresolved architecture problem, not solved by this
// timeoutSeconds value; see the resolution log entry for what a real fix
// needs (most likely calling this function's own Cloud Run URL directly for
// the /structure route, bypassing the Hosting rewrite's cap entirely, with
// its own CORS and client changes) and why it is out of scope here.
// 512MiB, not the unconfigured firebase-functions v2 default (256MiB): live
// testing after the timeoutSeconds fix above found real /structure calls
// against the deployed site taking 91-98s, while the exact same system
// prompt, schema, and transcript against the Anthropic Workbench directly
// finished in ~10s (docs/resolution-log.md, this entry's date). That ~10x
// gap has to be time spent inside this Function's own execution, not the
// model call; a too-small memory allocation throttles CPU proportionally in
// Cloud Run, and 256MiB is a tight budget for a Node process holding both
// the Firebase Admin SDK and the Anthropic SDK. 512MiB is a first, moderate
// test of that theory, not a final number: the phase-level timing logged
// below (`structure phase timings`) is what actually confirms or rules it
// out, not a guess.
exports.api = onRequest(
  { secrets: [ANTHROPIC_API_KEY, TODOIST_CLIENT_SECRET, GROQ_API_KEY], cors: false, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      // (a0) Transcribe: audio in, transcript out, via Groq's hosted Whisper
      // Large v3 Turbo. Shares the same daily request/cost ceiling as
      // Structure (checkAndReserveLimit, users/{uid}/llmUsage), not a second
      // parallel limit system. No dedicated trace collection, unlike
      // structureTraces: there is no prompt of our own to iterate on here,
      // so there is nothing for a trace-and-eval flywheel to feed; llmUsage
      // already gives cost visibility. See docs/llm-pipeline.md, Stage 1.
      if (endsWithPath(req, '/transcribe') && req.method === 'POST') {
        const limit = await checkAndReserveLimit(user.uid);
        if (!limit.allowed) {
          res.status(429).json({ error: limit.reason });
          return;
        }

        const { audioBase64, mimeType, durationSeconds } = req.body || {};
        if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
          res.status(400).json({ error: 'audioBase64 is required' });
          return;
        }
        if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          res.status(400).json({ error: 'durationSeconds must be a positive number' });
          return;
        }
        if (durationSeconds > TRANSCRIBE_MAX_DURATION_SECONDS) {
          res.status(400).json({ error: `recording exceeds the ${TRANSCRIBE_MAX_DURATION_SECONDS}-second limit` });
          return;
        }

        let audioBuffer;
        try {
          audioBuffer = Buffer.from(audioBase64, 'base64');
        } catch {
          res.status(400).json({ error: 'audioBase64 is not valid base64' });
          return;
        }
        if (audioBuffer.length === 0) {
          res.status(400).json({ error: 'audioBase64 is required' });
          return;
        }
        if (audioBuffer.length > TRANSCRIBE_MAX_BYTES) {
          res.status(400).json({ error: `recording exceeds the ${Math.floor(TRANSCRIBE_MAX_BYTES / (1024 * 1024))}MB limit` });
          return;
        }

        // Groq's API is OpenAI-compatible and expects multipart form data.
        // Node 20 (this Function's runtime, see firebase.json) has native
        // fetch/FormData/Blob, so the outgoing request is built directly with
        // those rather than adding the openai package as a new dependency for
        // one call.
        const form = new FormData();
        form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `recording.${extensionForMimeType(mimeType)}`);
        form.append('model', GROQ_TRANSCRIBE_MODEL);
        form.append('response_format', 'json');

        let groqRes;
        try {
          groqRes = await fetch(GROQ_TRANSCRIBE_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${GROQ_API_KEY.value()}` },
            body: form
          });
        } catch (err) {
          console.error('Groq transcription request failed', { errorMessage: String(err?.message ?? err) });
          res.status(502).json({ error: 'could not reach the transcription service' });
          return;
        }

        if (!groqRes.ok) {
          const bodyText = await groqRes.text().catch(() => '');
          console.error('Groq transcription returned an error', { status: groqRes.status, body: bodyText.slice(0, 2000) });
          res.status(502).json({ error: 'the transcription service could not process this recording' });
          return;
        }

        let groqBody;
        try {
          groqBody = await groqRes.json();
        } catch {
          res.status(502).json({ error: 'the transcription service returned an unreadable response' });
          return;
        }

        const transcript = typeof groqBody.text === 'string' ? groqBody.text : '';
        const billableSeconds = Math.max(durationSeconds, GROQ_MIN_BILLABLE_SECONDS);
        const costUsd = (billableSeconds / 3600) * GROQ_TRANSCRIBE_USD_PER_HOUR;
        await logUsage(limit.ref, { costUsd, audioSeconds: durationSeconds });

        res.json({ transcript });
        return;
      }

      // (a) Structuring call. One combined decision-and-tree call on Sonnet
      // (the named exception above), constrained by STRUCTURE_JSON_SCHEMA via
      // output_config.format so the API guarantees the response shape. The
      // browser (src/pipeline/structure.js) still validates what a schema
      // cannot and drives the one corrective retry, resubmitting here with
      // priorErrors when it does.
      if (endsWithPath(req, '/structure') && req.method === 'POST') {
        // Phase-level timing, added to find out where a slow /structure call
        // actually spends its time: a Workbench call with the exact same
        // system prompt, schema, and transcript finished in ~10s, but the
        // same request through this deployed Function took 91-98s across
        // three real live attempts before an upstream layer 502'd it
        // (docs/resolution-log.md, this entry's date). That ~10x gap can
        // only be inside this handler's own execution (cold start, a
        // Firestore round trip, memory-driven CPU throttling), not the model
        // call itself. Logged unconditionally (not gated behind
        // STORE_RAW_TRACES) so this is visible on every real call going
        // forward, not just a local debug run.
        const phaseStart = Date.now();
        const phaseTimingsMs = {};

        const limitStart = Date.now();
        const limit = await checkAndReserveLimit(user.uid);
        phaseTimingsMs.checkAndReserveLimit = Date.now() - limitStart;
        if (!limit.allowed) {
          res.status(429).json({ error: limit.reason });
          return;
        }

        const { transcript, existingProjects, priorErrors } = req.body || {};
        if (typeof transcript !== 'string' || !transcript.trim()) {
          res.status(400).json({ error: 'transcript is required' });
          return;
        }

        // Fetched fresh on every call, not cached in memory across
        // invocations: the whole point of moving this pool to Firestore is
        // that an auto-promotion (or a manual seed edit) is felt by the very
        // next real call, not only after a redeploy. A Firestore hiccup here
        // must not turn a working structuring call into a 500; an empty
        // examples array degrades gracefully to "written rules only", the
        // exact prompt shape this app ran before reference examples existed
        // at all, not a failure.
        let referenceExamples = [];
        const fetchExamplesStart = Date.now();
        try {
          referenceExamples = await fetchReferenceExamples();
        } catch (err) {
          console.error('fetchReferenceExamples failed, continuing with written rules only', {
            errorMessage: String(err?.message ?? err)
          });
        }
        phaseTimingsMs.fetchReferenceExamples = Date.now() - fetchExamplesStart;
        const structureSystemPrompt = referenceExamples.length
          ? [STRUCTURE_SYSTEM_PROMPT_RULES, '', formatReferenceExamples(referenceExamples)].join('\n')
          : STRUCTURE_SYSTEM_PROMPT_RULES;

        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
        const modelCallStart = Date.now();
        const response = await client.messages.create({
          // 8192, not 4096: a rich multi-section dump (several workstreams,
          // nested sub-tasks, a full reasoning string) hit the old 4096 cap
          // and got cut off mid-JSON, surfacing as "model response was not
          // valid JSON" with no way to tell truncation apart from a genuine
          // malformed response. See docs/resolution-log.md, 2026-07-07.
          model: ANTHROPIC_STRUCTURE_MODEL,
          max_tokens: 8192,
          // temperature: 0 was missing here, the real root cause behind the
          // 91-98s live 502s investigated across several prior passes
          // (timeoutSeconds, memory, and phase timing all ruled out as the
          // cause; see docs/resolution-log.md, this entry's date). This is
          // the one call docs/llm-pipeline.md documents as running at
          // temperature 0, and src/pipeline/prompt.js's buildMessages sets
          // it correctly, but that function is never the live call path
          // (Firebase Functions deploys only this file, not src/pipeline),
          // so this copy silently ran at the Anthropic API's own default
          // (1) instead the whole time. Phase-level timing on real deployed
          // calls showed duration scales almost exactly with output token
          // count (~60-90 tokens/sec, consistent with Sonnet's own real
          // generation speed): an unpinned temperature let a complex
          // transcript occasionally sample a much longer, more exploratory
          // completion, sometimes running the full max_tokens: 8192 budget,
          // and generating that many tokens simply takes long enough that
          // an upstream layer (Hosting/GFE, docs/architecture.md) cuts the
          // connection before it returns. A short transcript rarely hits
          // this, since there is little room for a long completion
          // regardless of temperature, which is exactly the "small text
          // works, long text 502s" pattern reported live.
          temperature: 0,
          system: structureSystemPrompt,
          messages: [
            {
              role: 'user',
              content: buildStructureUserPrompt({
                transcript,
                existingProjects: Array.isArray(existingProjects) ? existingProjects : [],
                priorErrors: Array.isArray(priorErrors) ? priorErrors : null
              })
            }
          ],
          output_config: { format: { type: 'json_schema', schema: STRUCTURE_JSON_SCHEMA } }
        });
        phaseTimingsMs.modelCall = Date.now() - modelCallStart;

        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;
        const costUsd =
          (inputTokens / 1_000_000) * STRUCTURE_INPUT_USD_PER_MTOK +
          (outputTokens / 1_000_000) * STRUCTURE_OUTPUT_USD_PER_MTOK;
        const logUsageStart = Date.now();
        await logUsage(limit.ref, { costUsd, inputTokens, outputTokens });
        phaseTimingsMs.logUsage = Date.now() - logUsageStart;

        const stopReason = response.stop_reason || null;
        const rawText = extractStructuredText(response.content);
        let parsedResponse = null;
        try {
          parsedResponse = JSON.parse(rawText);
        } catch {
          parsedResponse = null;
        }
        const ok = parsedResponse !== null && stopReason !== 'refusal' && stopReason !== 'max_tokens';

        // Logged before any failure branch below, not after, so a truncated
        // or malformed response is still visible in Cloud Logging when
        // LLM_STORE_RAW_TRACES=true. The prior placement (after a successful
        // JSON.parse) meant the one case worth debugging never got logged.
        if (STORE_RAW_TRACES) {
          // Local debugging only. Off by default in production.
          console.log('raw trace', JSON.stringify({ body: req.body, stopReason, rawText, usage: response.usage }));
        }

        const existingProjectsArr = Array.isArray(existingProjects) ? existingProjects : [];
        const logStructureTraceStart = Date.now();
        const traceId = await logStructureTrace(user.uid, {
          transcript,
          existingProjectIds: existingProjectsArr.map((p) => p.id),
          model: ANTHROPIC_STRUCTURE_MODEL,
          priorErrors: Array.isArray(priorErrors) ? priorErrors : null,
          stopReason,
          response: parsedResponse,
          rawText,
          // Anthropic's own request id, so a genuinely unexplained case can
          // be cross-referenced with Anthropic support if it recurs.
          responseId: response.id || null,
          // The piece that was missing: every content block's type and text
          // (or, for a non-text block, a truncated JSON dump of it), so a
          // repeat of the empty-rawText case shows exactly what came back
          // instead of leaving an empty string with no explanation.
          contentBlocks: (response.content || []).map((b) => ({
            type: b.type,
            text: b.type === 'text' ? b.text : JSON.stringify(b).slice(0, 2000)
          })),
          ok,
          inputTokens,
          outputTokens,
          costUsd
        });
        phaseTimingsMs.logStructureTrace = Date.now() - logStructureTraceStart;

        console.log('structure phase timings', {
          uid: user.uid,
          traceId,
          totalMs: Date.now() - phaseStart,
          ...phaseTimingsMs
        });

        if (stopReason === 'refusal') {
          res.status(502).json({ error: 'the model declined to respond' });
          return;
        }

        if (stopReason === 'max_tokens') {
          res.status(502).json({ error: 'model response was truncated (max_tokens reached) before it finished' });
          return;
        }

        if (parsedResponse === null) {
          res.status(502).json({ error: 'model response was not valid JSON' });
          return;
        }

        res.json({ traceId, structured: parsedResponse });
        return;
      }

      // (a2) Record the user's own confirmed/cancelled/confirmed_with_edits
      // decision on a trace the call above created. No model call, so it
      // never touches DAILY_REQUEST_LIMIT, DAILY_COST_LIMIT_USD, or
      // llmUsage. The path is built from the verified user.uid, never a
      // client-supplied path, so a user can only ever touch their own
      // trace. "confirmed_with_edits" is the third outcome state
      // docs/llm-pipeline.md named and deliberately deferred until the
      // preview itself became editable (SuperRambleModal.jsx): the
      // original response persisted at request time is never touched here,
      // only `edits` (what the user actually changed before Confirm) and
      // the outcome/outcomeAt fields are written, same merge-write shape
      // as a plain confirm or cancel.
      if (endsWithPath(req, '/structure/outcome') && req.method === 'POST') {
        const { traceId, outcome, edits } = req.body || {};
        const validOutcomes = ['confirmed', 'cancelled', 'confirmed_with_edits'];
        if (typeof traceId !== 'string' || !traceId || !validOutcomes.includes(outcome)) {
          res
            .status(400)
            .json({ error: 'traceId and a valid outcome (confirmed, cancelled, or confirmed_with_edits) are required' });
          return;
        }
        if (outcome === 'confirmed_with_edits' && !edits) {
          res.status(400).json({ error: 'edits is required when outcome is confirmed_with_edits' });
          return;
        }
        if (edits !== undefined && edits !== null && !isValidEdits(edits)) {
          res.status(400).json({ error: 'edits does not match the expected shape' });
          return;
        }
        const update = { outcome, outcomeAt: admin.firestore.FieldValue.serverTimestamp() };
        // Only ever written for confirmed_with_edits: a plain confirm or
        // cancel stays exactly the two-field update it always was, even if
        // a future client bug sent edits alongside one of those.
        if (outcome === 'confirmed_with_edits') {
          update.edits = {
            removedTasks: edits.removedTasks || [],
            projectNameChange: edits.projectNameChange ?? null,
            contentEdits: edits.contentEdits || []
          };
        }
        await db.doc(`users/${user.uid}/structureTraces/${traceId}`).set(update, { merge: true });
        res.json({ ok: true });
        return;
      }

      // (b) Todoist OAuth token exchange. The browser already knows its own
      // public client_id (VITE_TODOIST_CLIENT_ID) and the redirect_uri it
      // used for the authorize redirect; both are sent along here rather
      // than duplicated as a second hand-synced constant server-side, since
      // neither is secret and the exchange fails harmlessly if either is
      // wrong. Only TODOIST_CLIENT_SECRET is a real secret, and it never
      // leaves this Function. clientId is stored alongside the token so a
      // later refresh or revoke (below) doesn't need it resent.
      if (endsWithPath(req, '/todoist/oauth') && req.method === 'POST') {
        const { code, clientId, redirectUri } = req.body || {};
        if (typeof code !== 'string' || !code || typeof clientId !== 'string' || !clientId || typeof redirectUri !== 'string' || !redirectUri) {
          res.status(400).json({ error: 'code, clientId, and redirectUri are required' });
          return;
        }

        let tokenRes;
        try {
          tokenRes = await fetch(TODOIST_TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: TODOIST_CLIENT_SECRET.value(),
              code,
              redirect_uri: redirectUri
            })
          });
        } catch (err) {
          console.error('Todoist token exchange request failed', { errorMessage: String(err?.message ?? err) });
          res.status(502).json({ error: 'could not reach Todoist' });
          return;
        }

        if (!tokenRes.ok) {
          const bodyText = await tokenRes.text().catch(() => '');
          // clientId and redirectUri are logged too (neither is a secret):
          // an invalid_grant response from Todoist is most often a
          // redirect_uri mismatch between this exchange and the authorize
          // request that issued the code, or a code already used/expired.
          // Neither is visible from tokenRes.status/body alone, so a future
          // occurrence is diagnosable straight from this one log line
          // instead of needing a second round of guessing.
          console.error('Todoist token exchange returned an error', {
            status: tokenRes.status,
            body: bodyText.slice(0, 2000),
            clientId,
            redirectUri
          });
          // Honest, not an accusation: this is our own exchange call
          // failing (a network problem, a stale/reused code, a redirect_uri
          // mismatch), not the user declining anything on Todoist's consent
          // screen. A real decline arrives as error=access_denied on the
          // redirect itself (src/todoist/index.js), never through this
          // branch; conflating the two here was the actual reported bug.
          res.status(502).json({ error: 'Connecting to Todoist failed. Try again.' });
          return;
        }

        const tokenBody = await tokenRes.json().catch(() => null);
        if (!tokenBody || typeof tokenBody.access_token !== 'string') {
          res.status(502).json({ error: 'Todoist returned an unexpected response' });
          return;
        }

        // Newly-created Todoist apps default to refresh tokens enabled: the
        // access token is short-lived (expires_in around 3600 seconds) and
        // comes with a refresh_token. Legacy apps (refresh tokens disabled)
        // instead get one long-lived token and no expires_in at all, hence
        // the fallback below rather than assuming every response shape is
        // the same. Verified live against developer.todoist.com/api/v1
        // before writing this; see the resolution log's Todoist OAuth entry.
        const expiresInSeconds = typeof tokenBody.expires_in === 'number' ? tokenBody.expires_in : TODOIST_LEGACY_EXPIRES_IN_SECONDS;
        await db.doc(`users/${user.uid}/todoistAuth/token`).set({
          accessToken: tokenBody.access_token,
          refreshToken: typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : null,
          expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
          scope: typeof tokenBody.scope === 'string' ? tokenBody.scope : null,
          clientId,
          redirectUri,
          connectedAt: new Date().toISOString()
        });

        res.json({ connected: true });
        return;
      }

      // (b) Connection status. The token itself is never readable by the
      // client (firestore.rules denies users/{uid}/todoistAuth entirely,
      // the same treatment structureTraces gets), so Settings has no way to
      // know whether a connection already exists without asking the
      // Function directly.
      if (endsWithPath(req, '/todoist/status') && req.method === 'GET') {
        const snap = await db.doc(`users/${user.uid}/todoistAuth/token`).get();
        res.json({ connected: snap.exists });
        return;
      }

      // (b) Disconnect: revokes the token against Todoist's own real revoke
      // endpoint (DELETE /api/v1/access_tokens, verified live, not assumed)
      // before deleting the stored copy. The revoke call can fail (a
      // network hiccup, a token Todoist already considers invalid); the
      // stored token is deleted either way, since a user clicking
      // Disconnect wants this app to forget it regardless. `revoked` in the
      // response says which actually happened, so the client never
      // overclaims what Disconnect did.
      if (endsWithPath(req, '/todoist/disconnect') && req.method === 'POST') {
        const tokenRef = db.doc(`users/${user.uid}/todoistAuth/token`);
        const snap = await tokenRef.get();
        let revoked = false;
        if (snap.exists) {
          const data = snap.data();
          if (data.accessToken && data.clientId) {
            try {
              const revokeUrl = new URL(TODOIST_REVOKE_URL);
              revokeUrl.searchParams.set('client_id', data.clientId);
              revokeUrl.searchParams.set('client_secret', TODOIST_CLIENT_SECRET.value());
              revokeUrl.searchParams.set('access_token', data.accessToken);
              const revokeRes = await fetch(revokeUrl, { method: 'DELETE' });
              revoked = revokeRes.ok;
              if (!revokeRes.ok) {
                const bodyText = await revokeRes.text().catch(() => '');
                console.error('Todoist token revoke returned an error', { status: revokeRes.status, body: bodyText.slice(0, 500) });
              }
            } catch (err) {
              console.error('Todoist token revoke request failed', { errorMessage: String(err?.message ?? err) });
            }
          }
          await tokenRef.delete();
        }
        res.json({ ok: true, revoked });
        return;
      }

      // (b) Read the user's Todoist projects (names + ids, for routing).
      // Still stubbed on purpose: not needed until Structure can route into
      // an existing Todoist project, a separate future pass. See
      // docs/roadmap.md.
      if (endsWithPath(req, '/todoist/projects') && req.method === 'GET') {
        // STUB: POST api.todoist.com/api/v1/sync resource_types=["projects"].
        res.json({ stub: true, projects: [] });
        return;
      }

      // (b) Write the confirmed, new-project-only tree into the user's real
      // Todoist account (functions/todoist.js's buildSyncCommands). This is
      // not sync: a second, independent write alongside the local
      // store.createProjectTree write, no relationship between the two
      // after this point. Refreshes the stored access token first if it's
      // expired (or close to it); the rotated refresh token from that
      // response replaces the stored one, per Todoist's own rotation rule.
      if (endsWithPath(req, '/todoist/write') && req.method === 'POST') {
        const tokenRef = db.doc(`users/${user.uid}/todoistAuth/token`);
        const tokenSnap = await tokenRef.get();
        if (!tokenSnap.exists) {
          res.status(400).json({ error: 'Todoist is not connected' });
          return;
        }
        let tokenData = tokenSnap.data();

        if (isTokenExpired(tokenData.expiresAt)) {
          if (!tokenData.refreshToken) {
            res.status(401).json({ error: 'Todoist connection expired. Reconnect in Settings.' });
            return;
          }
          let refreshRes;
          try {
            refreshRes = await fetch(TODOIST_TOKEN_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: tokenData.clientId,
                client_secret: TODOIST_CLIENT_SECRET.value(),
                grant_type: 'refresh_token',
                refresh_token: tokenData.refreshToken
              })
            });
          } catch (err) {
            console.error('Todoist token refresh request failed', { errorMessage: String(err?.message ?? err) });
            res.status(502).json({ error: 'could not reach Todoist to refresh the connection' });
            return;
          }
          if (!refreshRes.ok) {
            const bodyText = await refreshRes.text().catch(() => '');
            console.error('Todoist token refresh returned an error', { status: refreshRes.status, body: bodyText.slice(0, 2000) });
            res.status(401).json({ error: 'Todoist connection expired. Reconnect in Settings.' });
            return;
          }
          const refreshed = await refreshRes.json().catch(() => null);
          if (!refreshed || typeof refreshed.access_token !== 'string') {
            res.status(502).json({ error: 'Todoist returned an unexpected response while refreshing' });
            return;
          }
          tokenData = {
            ...tokenData,
            accessToken: refreshed.access_token,
            refreshToken: typeof refreshed.refresh_token === 'string' ? refreshed.refresh_token : tokenData.refreshToken,
            expiresAt: new Date(
              Date.now() + (typeof refreshed.expires_in === 'number' ? refreshed.expires_in : TODOIST_LEGACY_EXPIRES_IN_SECONDS) * 1000
            ).toISOString()
          };
          await tokenRef.set(tokenData, { merge: true });
        }

        const { tree } = req.body || {};
        if (!tree || typeof tree !== 'object' || !tree.project || typeof tree.project.name !== 'string' || !tree.project.name.trim()) {
          res.status(400).json({ error: 'tree.project.name is required; the Todoist write only creates a new project' });
          return;
        }

        const commands = buildSyncCommands(tree);
        let syncRes;
        try {
          syncRes = await fetch(TODOIST_SYNC_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenData.accessToken}`,
              'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ commands: JSON.stringify(commands) })
          });
        } catch (err) {
          console.error('Todoist sync write request failed', { errorMessage: String(err?.message ?? err) });
          res.status(502).json({ error: 'could not reach Todoist' });
          return;
        }

        if (!syncRes.ok) {
          const bodyText = await syncRes.text().catch(() => '');
          console.error('Todoist sync write returned an error', { status: syncRes.status, body: bodyText.slice(0, 2000) });
          res.status(502).json({ error: 'Todoist did not accept the write' });
          return;
        }

        const syncBody = await syncRes.json().catch(() => null);
        const statuses = (syncBody && syncBody.sync_status) || {};
        const failedCommand = Object.values(statuses).find((s) => s !== 'ok');
        if (!syncBody || failedCommand) {
          console.error('Todoist sync command rejected', statuses);
          res.status(502).json({ error: 'Todoist rejected part of the write' });
          return;
        }

        res.json({ tempIdMapping: syncBody.temp_id_mapping || {} });
        return;
      }

      res.status(404).json({ error: 'not found' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal error' });
    }
  }
);

// ---------------------------------------------------------------------------
// Automatic grading and auto-promotion, triggered on structureTraces writes.
//
// This never runs as part of a live user request; it fires asynchronously,
// after POST /api/structure/outcome has already responded to the client.
// Mirrors scripts/grade-traces.mjs's exact grading call (same model rule:
// this app's default Haiku, never Sonnet, never confused with or billed
// against the real Structure call). grade-traces.mjs itself is unchanged and
// stays a manual backfill tool for traces that predate this trigger, or for
// re-running by hand; this is a THIRD hand-synced copy of the same grading
// logic, on top of STRUCTURE_SYSTEM_PROMPT_RULES and contracts.js above,
// the same "kept in sync by hand" trade-off this codebase has already made
// twice and accepted rather than restructure functions/ into an importable
// ESM package. See docs/resolution-log.md.

const GRADE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;
const REFERENCE_EXAMPLES_CAP = 30;

const GRADE_SYSTEM_PROMPT = [
  'You are a quality checker for a task-structuring tool, not the tool itself. You will be shown a transcript someone rambled and the structured response another model already produced from it. You do not restructure anything; you only judge what is already there.',
  'Check two things, independently:',
  '1. completeness: does anything mentioned in the transcript seem to be missing from the response (a task, a sub-task, a stated detail)? "ok" if nothing meaningful is missing, "flag" if something the transcript clearly asked for is absent.',
  '2. correctness: do the response\'s priorities and due dates look defensible given the transcript\'s own wording (its urgency language, its named dates)? "ok" if defensible, "flag" if a priority or due date looks backward or unsupported by anything the transcript actually said.',
  'Give a one-line reason for each verdict, in plain language, naming the specific task or phrase involved when you flag something. Do not invent detail the transcript does not contain, and do not judge style, tone, or project naming, only completeness and priority/due defensibility.'
].join('\n');

function buildGradeUserPrompt(transcript, response) {
  return ['TRANSCRIPT:', transcript, '', 'RESPONSE TO JUDGE:', JSON.stringify(response), '', 'Return your judgment now.'].join(
    '\n'
  );
}

const GRADE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    completeness: { enum: ['ok', 'flag'] },
    completenessReason: { type: 'string' },
    correctness: { enum: ['ok', 'flag'] },
    correctnessReason: { type: 'string' }
  },
  required: ['completeness', 'completenessReason', 'correctness', 'correctnessReason'],
  additionalProperties: false
};

async function gradeTrace(anthropicApiKey, transcript, response) {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const apiResponse = await client.messages.create({
    model: GRADE_MODEL,
    max_tokens: 512,
    system: GRADE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildGradeUserPrompt(transcript, response) }],
    output_config: { format: { type: 'json_schema', schema: GRADE_JSON_SCHEMA } }
  });

  const inputTokens = apiResponse.usage?.input_tokens || 0;
  const outputTokens = apiResponse.usage?.output_tokens || 0;
  const costUsd = (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK + (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK;

  const text = (apiResponse.content || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('');
  const verdict = JSON.parse(text);
  return { verdict, costUsd };
}

// Reconstructs the corrected tree a confirmed_with_edits trace's Confirm
// click actually wrote, from the model's real, untouched `response` plus
// the separate `edits` diff (docs/architecture.md's structureTraces field
// list): the trace schema only ever persists what changed, not a second
// full corrected tree, so this replays the diff onto a clone of the
// original. Content edits are always reliably applied: `originalContent`
// is captured client-side on the first edit, before any change, so it
// always matches the pristine response. Removals are reliable in the
// common case (a task removed without ever being content-edited first) but
// NOT for the "edited, then removed" sequence: the client's own
// removeTask drops any pending contentEdits entry for a removed task
// (SuperRambleModal.jsx), so `removedTasks[].content` in that sequence
// holds the edited text, which was never written back into `response` by
// a matching contentEdits entry either, and this function has no way to
// recover what the task's original content was. When a removal can't be
// matched, this is surfaced in `warnings` rather than guessed at; the
// caller treats any warning as "do not auto-promote this one", the same
// fail-closed posture the rest of this pipeline already takes on anything
// it cannot verify.
function reconstructCorrectedTree(response, edits) {
  const tree = JSON.parse(JSON.stringify(response));
  const warnings = [];

  if (edits.projectNameChange && tree.project && typeof tree.project.name === 'string') {
    tree.project.name = edits.projectNameChange.to;
  }

  for (const edit of edits.contentEdits || []) {
    let applied = false;
    for (const t of tree.tasks || []) {
      if (t.content === edit.originalContent) {
        t.content = edit.newContent;
        applied = true;
        break;
      }
      const subIndex = (t.subtasks || []).findIndex((s) => s.content === edit.originalContent);
      if (subIndex !== -1) {
        t.subtasks[subIndex].content = edit.newContent;
        applied = true;
        break;
      }
    }
    if (!applied) warnings.push(`content edit target not found: "${edit.originalContent}"`);
  }

  for (const removed of edits.removedTasks || []) {
    let found = false;
    const rootIndex = (tree.tasks || []).findIndex((t) => t.content === removed.content);
    if (rootIndex !== -1) {
      tree.tasks.splice(rootIndex, 1);
      found = true;
    } else {
      for (const t of tree.tasks || []) {
        const subIndex = (t.subtasks || []).findIndex((s) => s.content === removed.content);
        if (subIndex !== -1) {
          t.subtasks.splice(subIndex, 1);
          found = true;
          break;
        }
      }
    }
    if (!found) warnings.push(`removed task not found in reconstructed tree: "${removed.content}"`);
  }

  return { tree, warnings };
}

// referenceExamples/ stays bounded so the live prompt (and its own token
// cost) never grows unbounded from auto-promotion alone: once a write
// would take the collection over the cap, the oldest auto-promoted
// document is deleted, never a seed one (the 4 hand-picked originals are
// permanent, curated on purpose; only what accumulated on top is pruned).
async function enforceReferenceExamplesCap() {
  const snap = await db.collection('referenceExamples').get();
  if (snap.size <= REFERENCE_EXAMPLES_CAP) return;
  const autoPromoted = snap.docs
    .filter((d) => d.data().source === 'auto-promoted')
    .sort((a, b) => (a.data().addedAt?.toMillis?.() ?? 0) - (b.data().addedAt?.toMillis?.() ?? 0));
  if (autoPromoted.length === 0) return; // over cap on seed docs alone; nothing safe to prune
  await autoPromoted[0].ref.delete();
}

function summarize(verdict) {
  return `Completeness: ${verdict.completenessReason} Correctness: ${verdict.correctnessReason}`.slice(0, 300);
}

// uid is not in this task's own field list, but is written anyway: without
// it, scripts/review-queue.mjs (a top-level pipelineLearningLog reader) has
// no way to find the trace back under its owning users/{uid}/structureTraces
// subcollection to review or promote it. A real, functionally required
// addition, not scope creep.
async function logPipelineLearning({ kind, uid, traceId, summary }) {
  await db.collection('pipelineLearningLog').add({
    date: admin.firestore.FieldValue.serverTimestamp(),
    kind,
    uid,
    traceId,
    summary,
    resolved: false
  });
}

exports.gradeStructureTrace = onDocumentWritten(
  { document: 'users/{uid}/structureTraces/{traceId}', secrets: [ANTHROPIC_API_KEY] },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return; // deleted, nothing to grade

    const afterData = after.data();
    const { uid, traceId } = event.params;

    // Guards, in order: not a write-failure marker (nothing to grade); has
    // a real outcome yet (not "pending", still awaiting the user); not
    // already graded. This last check is what stops this trigger's own
    // merge write (below) from retriggering itself: that write sets
    // judgedAt, so the resulting second invocation sees it here and returns
    // immediately, one extra no-op invocation, never a loop. Verified this
    // is the actual mechanism, not assumed: see docs/resolution-log.md.
    if (afterData.traceWriteFailed) return;
    if (!afterData.outcome || afterData.outcome === 'pending') return;
    if (afterData.judgedAt) return;
    if (!afterData.response || typeof afterData.transcript !== 'string') return;

    let verdict;
    try {
      const graded = await gradeTrace(ANTHROPIC_API_KEY.value(), afterData.transcript, afterData.response);
      verdict = graded.verdict;
    } catch (err) {
      console.error('gradeStructureTrace: grading call failed', { traceId, errorMessage: String(err?.message ?? err) });
      return; // leave judgedAt unset; scripts/grade-traces.mjs can pick this trace up as a manual backfill later
    }

    const judgeNotes = summarize(verdict);
    await after.ref.set(
      {
        judgeCompleteness: verdict.completeness,
        judgeCorrectness: verdict.correctness,
        judgeNotes,
        judgedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const flagged = verdict.completeness === 'flag' || verdict.correctness === 'flag';
    if (!flagged) return; // nothing wrong by either signal; nothing worth a human's monthly attention

    // Auto-promotion only ever applies to a confirmed_with_edits trace the
    // grader also flagged: the user's own correction and the grader's
    // independent read agreeing is the two-signal bar this pass sets for
    // "automatic," per docs/pipeline-learnings.md. Every other flagged case
    // (cancelled, or a plain confirm with nothing edited) has no corrected
    // tree to promote from in the first place, so it is logged for the
    // monthly human check instead, the same bucket a failed auto-promotion
    // attempt below also falls into.
    if (afterData.outcome === 'confirmed_with_edits' && afterData.edits) {
      // A reference example must stay generic and reusable across any call,
      // never tied to one real historical Firestore id: the four hand-picked
      // originals all have targetProjectId: null already, not by accident.
      // A routing trace's targetProjectId is a real internal id specific to
      // this one account; baking it into a teaching example would leak it
      // into every future live prompt. Skipped, not attempted.
      if (afterData.response.targetProjectId) {
        await logPipelineLearning({
          kind: 'flagged',
          uid,
          traceId,
          summary: `Not auto-promoted (routes to an existing project by internal id, not reusable as a teaching example). ${judgeNotes}`
        });
        return;
      }

      const { tree, warnings } = reconstructCorrectedTree(afterData.response, afterData.edits);

      if (warnings.length) {
        await logPipelineLearning({
          kind: 'flagged',
          uid,
          traceId,
          summary: `Not auto-promoted (could not fully reconstruct the corrected tree: ${warnings.join('; ')}). ${judgeNotes}`
        });
        return;
      }

      const { valid, errors } = validateStructure(tree, { existingProjectIds: [] });
      const ungrounded = valid ? ungroundedContents(tree, afterData.transcript) : [];
      if (!valid || ungrounded.length) {
        const reason = !valid ? errors.join('; ') : `invented content: ${ungrounded.join(', ')}`;
        await logPipelineLearning({
          kind: 'flagged',
          uid,
          traceId,
          summary: `Not auto-promoted (reconstructed tree failed contract validation: ${reason}). ${judgeNotes}`
        });
        return;
      }

      await db.collection('referenceExamples').add({
        transcript: afterData.transcript,
        response: tree,
        source: 'auto-promoted',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        promotedFromTraceId: traceId,
        notes: judgeNotes
      });
      await enforceReferenceExamplesCap();

      await logPipelineLearning({ kind: 'auto-promoted', uid, traceId, summary: judgeNotes });
      return;
    }

    await logPipelineLearning({ kind: 'flagged', uid, traceId, summary: judgeNotes });
  }
);
