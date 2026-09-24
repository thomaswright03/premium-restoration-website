// Premium Restoration chat — keeping the estimate across reloads.
//
// The estimate in progress (or the last finished one) is kept in this tab's
// sessionStorage ("pr_chat_estimate"), so a reload doesn't lose it. It never
// leaves the browser and is gone when the tab is closed.
//
// Part of the chat (js/chat/*.js, see core.js); shares window.PRChat (C).

(function (C) {
  "use strict";

  var ESTIMATE_KEY = "pr_chat_estimate";
  // The estimate summary carried to the Get a Quote form (js/lead-form.js reads it).
  var SUMMARY_KEY = "pr_estimate_summary";

  /** @param {SavedEstimate | null} saved null forgets it */
  function saveEstimate(saved) {
    try {
      if (saved) sessionStorage.setItem(ESTIMATE_KEY, JSON.stringify(saved));
      else sessionStorage.removeItem(ESTIMATE_KEY);
    } catch (e) {
      /* storage blocked: the estimate just isn't kept across reloads */
    }
  }

  /** @returns {SavedEstimate | null} */
  function readSavedEstimate() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(ESTIMATE_KEY) || "null");
      if (saved && typeof saved === "object" && saved.values && saved.scope) return saved;
    } catch (e) {
      /* nothing saved, or storage blocked */
    }
    return null;
  }

  // Saves the estimate being worked out, at its current step.
  function persistEstimate() {
    var q = C.state.quoteState;
    if (!q) return;
    saveEstimate({ status: "active", index: q.index, values: q.values, scope: q.scope });
  }

  /** @param {string} text */
  function saveSummary(text) {
    try {
      sessionStorage.setItem(SUMMARY_KEY, text);
    } catch (e) {
      /* storage blocked: the contact form just starts empty */
    }
  }

  // Used by the other parts of the chat.
  C.saveEstimate = saveEstimate;
  C.readSavedEstimate = readSavedEstimate;
  C.persistEstimate = persistEstimate;
  C.saveSummary = saveSummary;
})((window.PRChat = window.PRChat || { state: {} }));
