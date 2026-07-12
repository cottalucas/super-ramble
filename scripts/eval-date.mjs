// Date-bucketing check. Not part of the LLM/pipeline eval: this is pure logic
// on src/lib/date.js, no model, no credits, no evals/ fixtures. Kept as its
// own script so npm run eval:offline (the pipeline contract check) stays
// untouched, per phase 2.7's constraint not to touch evals/ or src/pipeline/.
//
// Verified by hand against local timezones, DST transitions, and near-midnight
// datetime values before writing this: isToday and isOverdue only ever key off
// due.date, a bare local-calendar-day string set directly from the user's
// local day selection. They never derive a day from parsing due.datetime as a
// UTC instant, so there is no UTC-vs-local-day mismatch to fix. These cases
// exist to guard that property going forward.
//
// Run: npm run eval:date (also runs as part of npm run eval)

import { isToday, isOverdue, toISODate, parseISODate, addDays, todayISO } from '../src/lib/date.js';

const cases = [];
let passed = 0;
let failed = 0;

function check(id, describe, actual, expected) {
  const ok = actual === expected;
  cases.push({ id, describe, ok, actual, expected });
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${describe}${ok ? '' : `  (got ${actual}, want ${expected})`}`);
}

function withTime(dateISO, h, m) {
  const d = parseISODate(dateISO);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const today = todayISO();
const yesterday = toISODate(addDays(new Date(), -1));
const tomorrow = toISODate(addDays(new Date(), 1));

check('today-date-only', 'a bare date due today is Today, not Overdue', isToday({ date: today }), true);
check('today-date-only-not-overdue', 'a bare date due today is not Overdue', isOverdue({ date: today }), false);

check(
  'today-late-night',
  'due today at 23:59 local is still Today, not bucketed into tomorrow by a UTC slip',
  isToday({ date: today, datetime: withTime(today, 23, 59) }),
  true
);
check(
  'today-early-morning',
  'due today at 00:01 local is still Today, not bucketed into yesterday by a UTC slip',
  isToday({ date: today, datetime: withTime(today, 0, 1) }),
  true
);

check('yesterday-overdue', 'a bare date due yesterday is Overdue', isOverdue({ date: yesterday }), true);
check('yesterday-not-today', 'a bare date due yesterday is not Today', isToday({ date: yesterday }), false);
check(
  'yesterday-late-night-overdue',
  'due yesterday at 23:59 local is still Overdue, not pulled into today by a UTC slip',
  isOverdue({ date: yesterday, datetime: withTime(yesterday, 23, 59) }),
  true
);

check('tomorrow-not-overdue', 'a bare date due tomorrow is not Overdue', isOverdue({ date: tomorrow }), false);
check('tomorrow-not-today', 'a bare date due tomorrow is not Today', isToday({ date: tomorrow }), false);
check(
  'tomorrow-early-morning-not-today',
  'due tomorrow at 00:01 local is not Today, not pulled backward by a UTC slip',
  isToday({ date: tomorrow, datetime: withTime(tomorrow, 0, 1) }),
  false
);

check('no-due-not-today', 'a task with no due date at all is never Today', isToday(null), false);
check('no-due-not-overdue', 'a task with no due date at all is never Overdue', isOverdue(null), false);

console.log(`\n${passed}/${passed + failed} passed.`);
if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
