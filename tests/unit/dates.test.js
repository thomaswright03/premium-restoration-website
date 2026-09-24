"use strict";

// "Last backup: today / yesterday / N days ago" counts calendar days in the
// owner's time zone, not 24-hour periods.

// Utah time, with its daylight-saving changes. Set before any date is made.
process.env.TZ = "America/Denver";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calendarDaysBetween, describeAge } = require("../../js/admin/dates.js");

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);
const age = (from, to) => describeAge(calendarDaysBetween(from, to));

test("a backup at 23:00 is 'yesterday' at 08:00 the next day", () => {
  assert.equal(age(at(2026, 9, 23, 23), at(2026, 9, 24, 8)), "yesterday");
  // Accepts ISO strings (as stored) and timestamps (Date.now()).
  assert.equal(age(at(2026, 9, 23, 23).toISOString(), at(2026, 9, 24, 8).getTime()), "yesterday");
});

test("earlier the same day is 'today', however many hours ago", () => {
  assert.equal(age(at(2026, 9, 24, 0, 5), at(2026, 9, 24, 23, 55)), "today");
  assert.equal(age(at(2026, 9, 24, 8), at(2026, 9, 24, 8)), "today");
});

test("more than a day counts whole calendar days", () => {
  assert.equal(age(at(2026, 9, 21, 7), at(2026, 9, 24, 22)), "3 days ago");
  assert.equal(age(at(2026, 9, 21, 22), at(2026, 9, 24, 7)), "3 days ago");
});

test("a clock change never adds or loses a day", () => {
  // Clocks go forward on 8 March 2026 and back on 1 November 2026.
  assert.equal(age(at(2026, 3, 7, 23), at(2026, 3, 8, 8)), "yesterday");
  assert.equal(age(at(2026, 3, 1, 12), at(2026, 3, 15, 12)), "14 days ago");
  assert.equal(age(at(2026, 10, 31, 23), at(2026, 11, 1, 23, 30)), "yesterday");
  assert.equal(age(at(2026, 10, 25, 0, 30), at(2026, 11, 8, 0, 10)), "14 days ago");
});

test("a time in the future (a changed clock) or an unreadable date counts as today", () => {
  assert.equal(age(at(2026, 9, 25, 9), at(2026, 9, 24, 8)), "today");
  assert.equal(calendarDaysBetween("not a date", Date.now()), 0);
});
