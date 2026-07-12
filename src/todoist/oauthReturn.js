// Pure OAuth-return decision logic, no DOM/browser globals (no window,
// sessionStorage, or import.meta.env), so this is importable directly from
// scripts/eval-todoist.mjs with no Vite runtime needed, the same reason
// functions/todoist.js is its own dependency-free module. src/todoist/
// index.js wraps this with the real window.location/sessionStorage reads
// and the URL-stripping side effect; keep this file itself free of both.

// Todoist's own redirect carries either ?code&state (the user approved) or
// ?error=...&state (the user declined, or Todoist itself rejected the
// authorize request, e.g. an unregistered redirect_uri) per the OAuth spec.
// { error } when Todoist's own redirect carries one: "access_denied"
// specifically means the user declined on Todoist's consent screen; any
// other value is some other authorize-step failure on Todoist's side.
// { code } on a validated success. null when there is nothing to consume,
// or the CSRF state check fails, never surfaced as a specific reason to the
// user either way. See the resolution log's Todoist OAuth 502 entry for the
// bug this exists to prevent: a failure in the app's own token exchange
// call was surfacing to the user as if they had personally declined.
export function parseOAuthReturn({ code, state, error, storedState }) {
  if (error) return { error };
  if (!code || !state || !storedState || state !== storedState) return null;
  return { code };
}

// URLSearchParams follows application/x-www-form-urlencoded semantics,
// which treats a literal '+' in a query string as a space
// (`new URLSearchParams('a=b+c').get('a')` is `'b c'`, not `'b+c'`,
// verified directly, not assumed). Todoist's own redirect might not
// percent-encode a '+' that legitimately appears inside an opaque `code`
// value (a real risk for a base64-shaped token, which commonly contains
// '+'), silently corrupting it into a space before this app ever sees it,
// on every single attempt, independent of anything else being correct.
// Escaping a literal '+' to '%2B' first means '+' is always treated as
// literal here, never as a space, without touching genuine %XX escapes
// already present in the string. Uses the global URLSearchParams (available
// in both the browser and plain Node), not window.location, so this stays
// dependency-free and directly testable. See the resolution log's
// double-submit/invalid_grant investigation entry.
export function extractOAuthParams(search) {
  const params = new URLSearchParams(search.replace(/\+/g, '%2B'));
  return { code: params.get('code'), state: params.get('state'), error: params.get('error') };
}
