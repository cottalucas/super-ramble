// /api proxy. The browser never holds a secret and never calls the model or
// Todoist directly. It calls same-origin /api/**, this Function verifies the
// Firebase Auth token, reads secrets, enforces per-user daily limits, proxies
// the model and Todoist calls, and logs privacy-safe usage. See docs/architecture.md.
//
// First pass: the model and Todoist calls are stubbed to return contract-shaped
// fixtures. Auth verification, limit enforcement, and usage logging are real.
// Wiring the real Anthropic and Todoist calls is the next item (docs/roadmap.md).

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Secrets are set with: firebase functions:secrets:set <NAME>
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const TODOIST_CLIENT_SECRET = defineSecret('TODOIST_CLIENT_SECRET');

// Pinned config. One model, no Sonnet/Opus call path.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const DAILY_REQUEST_LIMIT = Number(process.env.LLM_DAILY_REQUEST_LIMIT || 100);
const DAILY_COST_LIMIT_USD = Number(process.env.LLM_DAILY_COST_LIMIT_USD || 1);
const STORE_RAW_TRACES = process.env.LLM_STORE_RAW_TRACES === 'true';

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
async function logUsage(ref, { costUsd = 0, inputTokens = 0, outputTokens = 0 }) {
  const inc = admin.firestore.FieldValue.increment;
  await ref.set(
    {
      requests: inc(1),
      costUsd: inc(costUsd),
      inputTokens: inc(inputTokens),
      outputTokens: inc(outputTokens),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

function endsWithPath(req, suffix) {
  return req.path === suffix || req.path.endsWith(suffix);
}

exports.api = onRequest(
  { secrets: [ANTHROPIC_API_KEY, TODOIST_CLIENT_SECRET], cors: false },
  async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      // (a) Structuring call.
      if (endsWithPath(req, '/structure') && req.method === 'POST') {
        const limit = await checkAndReserveLimit(user.uid);
        if (!limit.allowed) {
          res.status(429).json({ error: limit.reason });
          return;
        }

        // STUB: contract-shaped response. Real Haiku call wired next.
        // ANTHROPIC_API_KEY.value() and ANTHROPIC_MODEL are read here when live.
        const structured = {
          decision: 'tasks',
          reasoning: 'Stubbed response. The real structuring call is wired next.',
          targetProjectId: null,
          project: null,
          tasks: [],
          needsClarification: false,
          clarificationQuestion: null
        };

        await logUsage(limit.ref, { costUsd: 0, inputTokens: 0, outputTokens: 0 });
        if (STORE_RAW_TRACES) {
          // Local debugging only. Off by default in production.
          console.log('raw trace', JSON.stringify({ body: req.body, structured }));
        }
        res.json(structured);
        return;
      }

      // (b) Todoist OAuth token exchange.
      if (endsWithPath(req, '/todoist/oauth') && req.method === 'POST') {
        // STUB: exchange req.body.code for a token using TODOIST_CLIENT_SECRET.value().
        res.json({ stub: true, note: 'Todoist OAuth exchange wired next', scope: 'data:read_write' });
        return;
      }

      // (b) Read the user's Todoist projects (names + ids, for routing).
      if (endsWithPath(req, '/todoist/projects') && req.method === 'GET') {
        // STUB: POST api.todoist.com/api/v1/sync resource_types=["projects"].
        res.json({ stub: true, projects: [] });
        return;
      }

      // (b) Write the proposed project-with-nested-tasks on confirm.
      if (endsWithPath(req, '/todoist/write') && req.method === 'POST') {
        // STUB: batched commands to POST api.todoist.com/api/v1/sync.
        // project_add (temp_id) + item_add (project_id -> temp_id, parent_id -> parent temp_id).
        res.json({ stub: true, note: 'Batched Todoist create wired next', tempIdMapping: {} });
        return;
      }

      res.status(404).json({ error: 'not found' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal error' });
    }
  }
);
