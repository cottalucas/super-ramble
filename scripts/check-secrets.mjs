#!/usr/bin/env node
// Scans git-tracked files for the specific secret-shaped patterns that leaked
// into docs/resolution-log.md historically. See docs/orchestration.md.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FIREBASE_KEY = /AIzaSy[A-Za-z0-9_-]{30,}/g;
const HEX32 = /\b[a-f0-9]{32}\b/gi;
const SECRET_WORD = /client_secret|secret/i;
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_ALLOWLIST = [/@example\.com$/i, /@[a-z0-9.-]*gserviceaccount\.com$/i];

const PROXIMITY_CHARS = 300;
const SKIP_FILES = new Set(["package-lock.json"]);

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !SKIP_FILES.has(f.split("/").pop()));

let failures = [];

for (const file of trackedFiles) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // binary or unreadable, skip
  }

  for (const m of content.matchAll(FIREBASE_KEY)) {
    failures.push(`${file}: Firebase/Google API key literal found (AIzaSy...): "${m[0].slice(0, 12)}..."`);
  }

  for (const m of content.matchAll(HEX32)) {
    const start = Math.max(0, m.index - PROXIMITY_CHARS);
    const end = Math.min(content.length, m.index + m[0].length + PROXIMITY_CHARS);
    const window = content.slice(start, end);
    if (SECRET_WORD.test(window)) {
      failures.push(`${file}: 32-char hex value near "secret"/"client_secret": "${m[0]}"`);
    }
  }

  for (const m of content.matchAll(EMAIL)) {
    if (EMAIL_ALLOWLIST.some((re) => re.test(m[0]))) continue;
    failures.push(`${file}: literal email address (use the "redacted@example.com" placeholder convention instead): "${m[0]}"`);
  }
}

if (failures.length > 0) {
  console.error("Secret guard failed: secret-shaped or PII-shaped content found in tracked files.\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nRemove or redact the value above before committing. See docs/orchestration.md.");
  process.exit(1);
}

console.log("Secret guard: no secret-shaped or PII-shaped content found.");
