// Premium Restoration — Light / Dark / System colour theme switch.
//
// The choice is saved in this browser (localStorage "pr_theme"). "System"
// (the default) follows the device's setting. A tiny inline script in each
// page's <head> applies a saved choice before the page is first painted, so
// there is no flash of the wrong theme; this file wires up the buttons.

(function () {
  "use strict";

  var KEY = "pr_theme";

  function saved() {
    try {
      var t = localStorage.getItem(KEY);
      return t === "light" || t === "dark" ? t : "system";
    } catch (e) {
      return "system";
    }
  }

  /** @param {string} choice */
  function apply(choice) {
    if (choice === "light" || choice === "dark") {
      document.documentElement.setAttribute("data-theme", choice);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-choice]"), function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-choice") === choice ? "true" : "false");
    });
  }

  /** @param {string} choice */
  function choose(choice) {
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch (e) {
      /* storage blocked: the choice still applies to this page view */
    }
    apply(choice);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-choice]"), function (btn) {
      btn.addEventListener("click", function () {
        choose(btn.getAttribute("data-theme-choice"));
      });
    });
    apply(saved());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
