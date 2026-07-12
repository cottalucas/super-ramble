// "My Projects" collapse preference in the sidebar: shown or hidden, a
// client-only choice in localStorage, the same pattern src/lib/sidebar.js
// already uses for the whole sidebar's own show/hide preference (and
// src/lib/theme.js, src/lib/layout.js follow too). This collapses the whole
// root project list at once; a single project's own children still collapse
// through ProjectNode's own caret, a separate, unpersisted, per-project
// state (docs/architecture.md). See docs/design-system.md.
const STORAGE_KEY = 'super-ramble:projects-panel';

export function getProjectsPanelCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function setProjectsPanelCollapsed(collapsed) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'shown');
  } catch {
    // Private browsing or a full quota. Only persistence across reloads is lost.
  }
  return collapsed;
}
