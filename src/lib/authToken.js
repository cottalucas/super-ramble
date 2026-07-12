import { auth } from '../firebase.js';

// Shared by every caller of the /api proxy (Structure, Transcribe, Todoist).
// Local preview has no real Firebase Auth user, so it sends no bearer token;
// every real /api call still requires one and 401s without it, local
// preview included, since the Function verifies the token itself.
export async function getAuthToken(isLocal) {
  if (isLocal || !auth?.currentUser) return null;
  return auth.currentUser.getIdToken();
}
