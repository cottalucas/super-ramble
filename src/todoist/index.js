// Todoist client: OAuth connect/disconnect, connection status, and the
// one-shot batched project create (phase 3, part 8). This is not sync: a
// second, independent write of a confirmed Super Ramble project into the
// user's real Todoist account, alongside the existing local
// store.createProjectTree write. After that write the local copy and the
// Todoist copy have no relationship; editing one never touches the other.
// The target is the Todoist REST API v1 at developer.todoist.com, the
// unified API, base URL https://api.todoist.com/api/v1. Not the archived v6
// Sync API. See docs/architecture.md.

import { parseOAuthReturn, extractOAuthParams } from './oauthReturn.js';

const TODOIST_CLIENT_ID = import.meta.env.VITE_TODOIST_CLIENT_ID;
// The app has no client-side router; this is the app's own root URL, not a
// dedicated callback route. Hardcoded, not derived from
// window.location.origin: only this exact URL is registered on the Todoist
// app console, so OAuth connect only completes end to end from the deployed
// app, never from a local dev server. No trailing slash: the Todoist App
// Console rejects a trailing slash on the registered redirect URL as
// invalid, so the registered value and this constant are both slash-free.
// This is the one and only copy of the value; exchangeTodoistCode below
// sends it to the Function as part of the request body rather than the
// Function holding a second, hand-synced copy, so the two can't drift out
// of sync with each other again. See docs/roadmap.md and the resolution
// log's Todoist OAuth entry.
export const TODOIST_REDIRECT_URI = 'https://super-ramble.web.app';
const TODOIST_AUTHORIZE_URL = 'https://app.todoist.com/oauth/authorize';
const OAUTH_STATE_KEY = 'super-ramble:todoist-oauth-state';

// Step 1: send the browser to Todoist's own authorize screen. A CSRF state
// param is generated and stashed in sessionStorage; it only needs to
// survive the redirect round trip. Scope verified live against
// developer.todoist.com, see the resolution log entry dated 2026-06-30.
export function beginTodoistConnect() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  const url = new URL(TODOIST_AUTHORIZE_URL);
  url.searchParams.set('client_id', TODOIST_CLIENT_ID);
  url.searchParams.set('scope', 'data:read_write');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', TODOIST_REDIRECT_URI);
  window.location.href = url.toString();
}

// True the instant the URL carries any OAuth return, success or failure,
// before it's consumed. Todoist's own redirect carries either ?code&state
// (the user approved) or ?error=...&state (the user declined, or Todoist
// itself rejected the authorize request, e.g. an unregistered redirect_uri)
// per the OAuth spec; both need to be caught and stripped from the URL, not
// just the success shape. Uses extractOAuthParams, not a bare
// URLSearchParams read, so a literal '+' inside an opaque code value is
// never silently read as a space (see oauthReturn.js).
export function hasTodoistOAuthReturn() {
  const { code, error } = extractOAuthParams(window.location.search);
  return Boolean(code || error);
}

// parseOAuthReturn and extractOAuthParams (the actual decision logic and
// the '+'-safe param extraction) live in their own dependency-free module,
// oauthReturn.js, so both are importable straight from
// scripts/eval-todoist.mjs with no Vite runtime; re-exported here too so
// every existing caller of this file keeps working unchanged.
export { parseOAuthReturn, extractOAuthParams };

// Reads and validates the OAuth return synchronously, then strips the query
// params via history.replaceState so a refresh never re-triggers anything,
// unconditionally, on every outcome (success, a real Todoist-side error, or
// a failed CSRF check), not only on success: a failed attempt that left the
// spent code sitting in the URL would let any later reload or remount
// silently retry it, guaranteed invalid_grant every time. Everything here
// is synchronous on purpose (including the history.replaceState call), so
// a second, near-simultaneous invocation (React StrictMode's double effect
// firing in dev, or any other double-mount) sees an already-stripped URL
// and no-ops via hasTodoistOAuthReturn, no ref or guard flag needed at this
// layer; exchangeTodoistCode below adds its own independent guard too, so
// the two protections don't rely on each other.
export function consumeTodoistOAuthReturn() {
  const { code, state, error } = extractOAuthParams(window.location.search);
  const result = parseOAuthReturn({ code, state, error, storedState: sessionStorage.getItem(OAUTH_STATE_KEY) });
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  history.replaceState(null, '', window.location.pathname);
  return result;
}

async function callApi(path, { method = 'GET', body, getAuthToken } = {}) {
  const token = await getAuthToken();
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Request failed (${res.status}).`);
  }
  return res.json();
}

// A module-level guard, not a component-level ref: this survives any
// number of remounts of whatever called it, within the same page load,
// since it isn't tied to any one component instance. A Todoist
// authorization code is single-use; exchanging the same one twice is
// guaranteed invalid_grant on the second attempt even when everything else
// about the request is correct. consumeTodoistOAuthReturn already strips
// the code from the URL before this ever runs, which independently
// prevents a second *read* of the same code; this guard independently
// prevents a second *exchange* of one already read, so the two protections
// don't depend on each other holding.
let oauthCodeBeingExchanged = null;

// Step 2: exchange the code for a token. The Function stores it
// server-side, under users/{uid}/todoistAuth/token, never readable by the
// client (firestore.rules denies it entirely, the same treatment
// structureTraces gets, a distinct case: see docs/architecture.md).
export async function exchangeTodoistCode(code, getAuthToken) {
  if (oauthCodeBeingExchanged === code) {
    throw new Error('This Todoist connection is already being processed.');
  }
  oauthCodeBeingExchanged = code;
  try {
    return await callApi('/api/todoist/oauth', {
      method: 'POST',
      body: { code, clientId: TODOIST_CLIENT_ID, redirectUri: TODOIST_REDIRECT_URI },
      getAuthToken
    });
  } finally {
    oauthCodeBeingExchanged = null;
  }
}

export function getTodoistStatus(getAuthToken) {
  return callApi('/api/todoist/status', { getAuthToken });
}

// Revokes against Todoist's own real revoke endpoint before deleting the
// stored copy server-side; see functions/index.js's /todoist/disconnect for
// what "revoked" in the response actually reflects.
export function disconnectTodoist(getAuthToken) {
  return callApi('/api/todoist/disconnect', { method: 'POST', getAuthToken });
}

export function createTodoistClient({ getAuthToken }) {
  return {
    async readProjects() {
      // STUB: POST /api/v1/sync resource_types=["projects"]. Not needed
      // until Structure can route into an existing Todoist project, a
      // separate future pass. See docs/roadmap.md.
      return [];
    },

    async readLabels() {
      // STUB: POST /api/v1/sync resource_types=["labels"].
      return [];
    },

    // tree is the exact shape store.createProjectTree and
    // src/pipeline/write.js's toProjectTree already produce: { project,
    // sections, tasks }. This pass only ever calls it with a fresh
    // { name: ... } project, the new-project-only scope docs/roadmap.md
    // states; no adapter needed here, functions/todoist.js maps the shape
    // directly to Sync API commands server-side.
    createTree(tree) {
      return callApi('/api/todoist/write', { method: 'POST', body: { tree }, getAuthToken });
    }
  };
}
