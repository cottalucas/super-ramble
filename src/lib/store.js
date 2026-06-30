// Store interface seam. The rest of the app talks to this shape, never to
// Firestore directly. That keeps the data layer swappable and testable, and
// it is the boundary the orchestration loop protects (see docs/orchestration.md).
//
// Every value written through this seam that holds personal free text
// (transcripts, task contents, project names) must be encrypted client-side
// first (see lib/crypto.js). The store never writes plaintext personal data.
//
// First pass: the Firestore implementation is stubbed. The shape is the
// contract; wiring the real reads/writes is a Next item (see docs/roadmap.md).

/**
 * @typedef {Object} Store
 * @property {(uid: string) => Promise<object|null>} getProfile
 * @property {(uid: string, data: object) => Promise<void>} saveDraft
 * @property {(uid: string) => Promise<object[]>} listDrafts
 * @property {(uid: string, day: string) => Promise<object|null>} getUsage  // users/{uid}/llmUsage/{YYYY-MM-DD}
 */

/** @returns {Store} */
export function createStore() {
  return {
    async getProfile() {
      return null;
    },
    async saveDraft() {
      // No-op until the propose-confirm-write flow lands.
    },
    async listDrafts() {
      return [];
    },
    async getUsage() {
      return null;
    }
  };
}
