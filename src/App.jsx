import Placeholder from './ui/Placeholder.jsx';
import { firebaseReady } from './lib/firebase.js';

// First pass: one calm, deployable page. The auth gate is a seam, not a wall.
// VITE_ENABLE_LOCAL_PREVIEW shows the page without auth during development.
// Real auth and the propose-confirm-write flow arrive next (see docs/roadmap.md).
export default function App() {
  const localPreview = import.meta.env.VITE_ENABLE_LOCAL_PREVIEW === 'true';

  // When config is missing and we are not in local preview, say so plainly
  // instead of rendering a broken page.
  if (!firebaseReady && !localPreview) {
    return (
      <Placeholder
        note="Firebase config is missing. Copy .env.example to .env.local and fill it in."
      />
    );
  }

  return <Placeholder />;
}
