// Layout preference: List or Board, a single client-only choice in
// localStorage, never a Firestore document. One preference for every view
// that supports Board, not a per-view setting, mirroring src/lib/theme.js's
// pattern. See docs/design-system.md and docs/roadmap.md (Phase 2.8).
const STORAGE_KEY = 'super-ramble:layout';

export function getLayout() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export function setLayout(layout) {
  const next = layout === 'board' ? 'board' : 'list';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing or a full quota. Persistence across reloads is lost;
    // the caller's own state still holds for this session.
  }
  return next;
}
