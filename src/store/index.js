// The store interface. The app imports createStore, never Firestore directly.
// One adapter sits behind the interface: Firestore when configured and signed in
// with a real account, localStorage in local preview or when config is missing.
// Both adapters implement the same methods. See docs/architecture.md.

import { db, firebaseReady } from '../firebase.js';
import { createLocalStore } from './local-store.js';
import { createFirestoreStore } from './firestore-store.js';

export function createStore(uid, { local = false } = {}) {
  if (firebaseReady && db && !local) {
    return createFirestoreStore(db, uid);
  }
  return createLocalStore(uid);
}
