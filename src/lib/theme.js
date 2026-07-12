// Theme preference: a client-only choice in localStorage, never a Firestore
// document. Applied through data-theme on the root; only [data-theme="dark"]
// in src/styles.css defines overrides, light is the implicit default. The
// same key is read synchronously in index.html before first paint, so there
// is no flash of the wrong theme; this module just keeps localStorage and the
// live DOM attribute in sync for the rest of the session. See
// docs/design-system.md.
const STORAGE_KEY = 'super-ramble:theme';

export function getTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing or a full quota. The attribute above still holds for
    // this session; only persistence across reloads is lost.
  }
}
