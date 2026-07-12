// Guards against the exact mistake that shipped local-preview mode to
// production (see docs/resolution-log.md, dated 2026-07-07): Vite loads
// .env.local for every build, dev or production, so a local convenience flag
// left on gets baked straight into a deployed bundle. Bundle-sniffing after
// the fact is fragile against minifier changes; this checks the source of
// truth directly, before a build ever runs.
//
// Run before any `firebase deploy` that includes a hosting rebuild:
//   npm run verify:prod-env

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');

function parseEnv(text) {
  const vars = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

async function main() {
  let text;
  try {
    text = await readFile(envPath, 'utf8');
  } catch {
    console.error(`No .env.local found at ${envPath}. Nothing to verify against.`);
    process.exit(1);
    return;
  }

  const vars = parseEnv(text);
  if (vars.VITE_ENABLE_LOCAL_PREVIEW === 'true') {
    console.error(
      'VITE_ENABLE_LOCAL_PREVIEW=true in .env.local. A production build made from this checkout ' +
        'would ship local-preview mode: a fake signed-in user, no real Firebase Auth, and every ' +
        '/api/** call missing its Authorization header. Set it to false before running npm run build ' +
        'for a deploy.'
    );
    process.exit(1);
    return;
  }

  console.log('.env.local: VITE_ENABLE_LOCAL_PREVIEW is not true. Safe to build for production.');
}

main();
