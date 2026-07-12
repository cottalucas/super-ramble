// Sidebar visibility preference: shown or hidden, a client-only choice in
// localStorage, the same pattern as src/lib/theme.js and src/lib/layout.js.
// See docs/roadmap.md (Phase 2.8).
const STORAGE_KEY = 'super-ramble:sidebar';

export function getSidebarHidden() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hidden';
  } catch {
    return false;
  }
}

export function setSidebarHidden(hidden) {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? 'hidden' : 'shown');
  } catch {
    // Private browsing or a full quota. Only persistence across reloads is lost.
  }
  return hidden;
}
