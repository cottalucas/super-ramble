// Current view: which nav item or project was last open, a client-only
// choice in localStorage, the same pattern as theme, layout, and sidebar.
// Explicitly not routing: no URL, no shareable link, no back/forward button
// support. This only restores where you were after a refresh. See
// docs/roadmap.md.
const STORAGE_KEY = 'super-ramble:view';

const DEFAULT_VIEW = { type: 'today' };

export function getView() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.type !== 'string') return DEFAULT_VIEW;
    return parsed;
  } catch {
    return DEFAULT_VIEW;
  }
}

export function setView(view) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Private browsing or a full quota. Persistence across reloads is lost;
    // the caller's own state still holds for this session.
  }
}
