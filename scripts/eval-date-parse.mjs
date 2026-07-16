// Write-stage due-date parsing coverage (natural-language date parser). Not
// part of the LLM/pipeline eval: pure logic on src/pipeline/write.js's
// toDue(), no model, no credits, no evals/ fixtures, the same "its own
// script" shape scripts/eval-date.mjs, scripts/eval-todoist.mjs, and
// scripts/eval-write.mjs already use.
//
// Anchored to whatever "now" actually is when this runs, not a hardcoded
// date: every relative-date expectation below is computed from the same
// src/lib/date.js helpers toDue() itself uses (toISODate, addDays,
// todayISO), so this holds on any day it runs, not just the day it was
// written.
//
// Run: npm run eval:date-parse (also runs as part of npm run eval)

import { toDue } from '../src/pipeline/write.js';
import { toISODate, addDays, todayISO, parseISODate, WEEKDAYS } from '../src/lib/date.js';

let passed = 0;
let failed = 0;

function check(id, describe, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${describe}${ok ? '' : `  (got ${a}, want ${e})`}`);
}

function assertTrue(id, describe, condition, detail) {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${id}  ${describe}${condition ? '' : `  (${detail})`}`);
}

const today = todayISO();
const tomorrow = toISODate(addDays(new Date(), 1));

// --- Relative dates resolve to the correct local day, not a UTC slip ---
{
  const due = toDue('tomorrow');
  check('tomorrow-date', "'tomorrow' resolves to tomorrow's local date", due.date, tomorrow);
  check('tomorrow-no-datetime', "'tomorrow' alone leaves datetime null, no midnight default guessed in", due.datetime, null);
  check('tomorrow-string-verbatim', "'tomorrow' carries the raw string through unchanged", due.string, 'tomorrow');
  check('tomorrow-not-recurring', "'tomorrow' is a one-off date, not recurring", due.isRecurring, false);
}
{
  const due = toDue('today');
  check('today-date', "'today' resolves to today's local date", due.date, today);
}

// --- 'next Friday' and a bare weekday resolve into the future, never the past ---
{
  const due = toDue('next Friday');
  assertTrue('next-friday-future', "'next Friday' resolves to a date on or after today, never in the past", due.date !== null && due.date >= today, `got ${due.date}`);
  const weekday = due.date ? parseISODate(due.date).getDay() : null;
  assertTrue('next-friday-is-friday', "'next Friday' resolves to an actual Friday", weekday === 5, `got weekday ${weekday}`);
}
{
  // Pick yesterday's own weekday name: parsing it bare must never resolve
  // back to yesterday itself (the past), only forward to a future
  // occurrence. Chosen dynamically, not hardcoded, so this holds regardless
  // of which day the suite runs on.
  const yesterday = addDays(new Date(), -1);
  const yesterdayISO = toISODate(yesterday);
  const weekdayName = WEEKDAYS[yesterday.getDay()];
  const due = toDue(weekdayName);
  assertTrue(
    'bare-weekday-future',
    `a bare weekday ('${weekdayName}') resolves into the future, never the past`,
    due.date !== null && due.date >= today && due.date !== yesterdayISO,
    `got ${due.date}, yesterday was ${yesterdayISO}`
  );
}

// --- A real stated time sets datetime with the right hour; no time stated leaves it null ---
{
  const due = toDue('tomorrow at 3pm');
  check('tomorrow-3pm-date', "'tomorrow at 3pm' still resolves the date correctly", due.date, tomorrow);
  assertTrue('tomorrow-3pm-datetime-set', "'tomorrow at 3pm' sets a real datetime", due.datetime !== null, `got ${due.datetime}`);
  const hour = due.datetime ? new Date(due.datetime).getHours() : null;
  check('tomorrow-3pm-hour', "'tomorrow at 3pm' sets the stated hour (15:00 local)", hour, 15);
}

// --- Recurring language sets isRecurring true, independent of whether a single date resolves; a one-off date does not ---
{
  const due = toDue('every Monday');
  check('every-monday-recurring', "'every Monday' sets isRecurring true", due.isRecurring, true);
}
{
  const due = toDue('daily');
  check('daily-recurring', "'daily' sets isRecurring true even with no single resolvable date", due.isRecurring, true);
  check('daily-no-date', "'daily' alone has no single calendar day to resolve to", due.date, null);
}
{
  const due = toDue('Friday');
  check('friday-not-recurring', 'a one-off weekday is not recurring', due.isRecurring, false);
}

// --- Unparseable strings fail closed: the exact current shape, no throw, no guess ---
for (const raw of ['asap', 'sometime', '']) {
  const due = toDue(raw);
  check(`unparseable-${JSON.stringify(raw)}`, `'${raw}' falls back to the exact current shape, no throw`, due, {
    date: null,
    datetime: null,
    string: raw,
    isRecurring: false
  });
}

// --- null in, null out ---
check('null-input', 'a null due stays null, no object built for it', toDue(null), null);

console.log(`\n${passed}/${passed + failed} passed.`);
if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
