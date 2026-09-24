// Premium Restoration admin tool — how long ago something happened, in the
// calendar days the owner lives by: a backup made at 11 pm was made
// "yesterday" when the tool is opened at 8 am, even though fewer than 24
// hours have passed. Days are counted between local midnights, so a clock
// change (daylight saving) never adds or loses a day.
//
// Loads in the browser (window.CalendarDays, before js/admin/core.js) and in
// Node for the unit tests.

(function (/** @type {any} */ root) {
  "use strict";

  var DAY_MS = 24 * 60 * 60 * 1000;

  /** @param {Date} date */
  function localMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  // Whole calendar days from `earlier` to `later` (0 on the same day; never
  // negative). Both are Dates, ISO strings or timestamps.
  /**
   * @param {string | number | Date} earlier
   * @param {string | number | Date} later
   */
  function calendarDaysBetween(earlier, later) {
    var a = localMidnight(new Date(earlier));
    var b = localMidnight(new Date(later));
    if (isNaN(a) || isNaN(b)) return 0;
    // A day with a clock change is 23 or 25 hours long, so round.
    return Math.max(0, Math.round((b - a) / DAY_MS));
  }

  /** @param {number} days */
  function describeAge(days) {
    return days === 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
  }

  var api = { calendarDaysBetween: calendarDaysBetween, describeAge: describeAge };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CalendarDays = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
