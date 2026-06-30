// Local trace summary. Reads raw traces written by local live calls under
// llm-traces/ (gitignored) and reports total cost, per-step token and cost
// breakdown, failures, and a budget block against LLM_SPEND_CEILING_USD.
//
// Production usage is not read here. Production records privacy-safe usage per
// user per day in Firestore at users/{uid}/llmUsage/{YYYY-MM-DD}. This script
// is a local spend watch only. See docs/architecture.md.
//
// Run: npm run trace:summary

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tracesDir = join(root, 'llm-traces');
const ceiling = Number(process.env.LLM_SPEND_CEILING_USD || 50);

function usd(n) {
  return `$${n.toFixed(4)}`;
}

function bar(fraction, width = 24) {
  const filled = Math.min(width, Math.max(0, Math.round(fraction * width)));
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

async function main() {
  console.log('super-ramble local trace summary\n');

  if (!existsSync(tracesDir)) {
    console.log('No llm-traces/ directory yet. Nothing to summarize.');
    console.log(`Budget: ${usd(0)} of ${usd(ceiling)} used ${bar(0)} 0%`);
    return;
  }

  const files = (await readdir(tracesDir)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No traces captured yet. Run a local live call to populate llm-traces/.');
    console.log(`Budget: ${usd(0)} of ${usd(ceiling)} used ${bar(0)} 0%`);
    return;
  }

  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  let failures = 0;
  const perStep = new Map();

  for (const file of files) {
    let trace;
    try {
      trace = JSON.parse(await readFile(join(tracesDir, file), 'utf8'));
    } catch {
      console.log(`(skipped unreadable trace: ${file})`);
      continue;
    }
    const step = trace.step || 'unknown';
    const cost = Number(trace.costUsd || 0);
    const inTok = Number(trace.inputTokens || 0);
    const outTok = Number(trace.outputTokens || 0);
    if (trace.ok === false || trace.error) failures += 1;

    totalCost += cost;
    totalIn += inTok;
    totalOut += outTok;

    const agg = perStep.get(step) || { calls: 0, cost: 0, inTok: 0, outTok: 0 };
    agg.calls += 1;
    agg.cost += cost;
    agg.inTok += inTok;
    agg.outTok += outTok;
    perStep.set(step, agg);
  }

  console.log(`Traces: ${files.length}    Failures: ${failures}\n`);
  console.log('Per step:');
  for (const [step, a] of perStep) {
    console.log(
      `  ${step.padEnd(16)} calls=${a.calls}  in=${a.inTok}  out=${a.outTok}  cost=${usd(a.cost)}`
    );
  }

  console.log(`\nTotals: in=${totalIn}  out=${totalOut}  cost=${usd(totalCost)}`);

  const fraction = ceiling > 0 ? totalCost / ceiling : 0;
  const pct = Math.round(fraction * 100);
  console.log(
    `\nBudget: ${usd(totalCost)} of ${usd(ceiling)} used ${bar(fraction)} ${pct}%`
  );
  if (fraction >= 1) {
    console.error('\nLocal spend ceiling reached. Stop live runs or raise LLM_SPEND_CEILING_USD.');
    process.exit(1);
  } else if (fraction >= 0.8) {
    console.warn('\nApproaching the local spend ceiling.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
