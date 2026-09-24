// Premium Restoration — optional, privacy-respecting visitor counts.
//
// OFF unless site-config.json has "analytics": { "enabled": true, "provider":
// "vercel" | "plausible" } (see README "Visitor counts"). Both providers
// count without cookies and show the owner totals only. When it is on:
//
//   - page views are counted by the provider's script, and
//   - these events are counted (names only, never anything the visitor
//     typed): see EVENTS below.
//
// Error reports (also OFF unless "errorReports": { "enabled": true }, and
// only while counting is on, through the same provider): a script error on
// the page, a file that fails to load, or site-config.json not loading (or
// its prices being unusable) is sent as one named event with a few safe
// details — which file and line, the kind of error, the page — never the
// error's message (it could contain something the visitor typed), never
// anything from a form or the chat, no cookies. At most 5 per page view,
// each different. See README "Error reports".
//
// Nothing is loaded, counted or reported when it is off, on the admin tool
// (<html data-no-analytics>), or when the browser sends Do Not Track or
// Global Privacy Control. The Privacy Notice describes it only when it is on.
//
// Other scripts call: SiteAnalytics.track(SiteAnalytics.EVENTS.ESTIMATE_STARTED)

(function () {
  "use strict";

  var EVENTS = {
    ESTIMATE_STARTED: "Estimate started",
    ESTIMATE_COMPLETED: "Estimate completed",
    ESTIMATE_PDF_FAILED: "Estimate PDF failed",
    CONTACT_ABOUT_ESTIMATE: "Get a Quote from estimate",
    QUOTE_REQUEST_SENT: "Quote request sent",
    QUOTE_REQUEST_FAILED: "Quote request failed",
    QUOTE_EMAIL_OPENED: "Quote email opened",
    // Error reports (only with errorReports.enabled).
    SCRIPT_ERROR: "Script error",
    SETTINGS_FAILED: "Settings failed to load",
  };

  var PLAUSIBLE_SCRIPT = "https://plausible.io/js/script.js";
  var VERCEL_SCRIPT = "/_vercel/insights/script.js";

  function privacySignal() {
    return (
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      navigator.msDoNotTrack === "1" ||
      navigator.globalPrivacyControl === true
    );
  }

  function addScript(src, attrs) {
    var el = document.createElement("script");
    el.src = src;
    el.defer = true;
    Object.keys(attrs || {}).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    document.head.appendChild(el);
  }

  // Returns a function that sends one event, or null when nothing is counted.
  function start(config) {
    var a = config && config.analytics;
    if (!a || !a.enabled || privacySignal()) return null;
    if (document.documentElement.hasAttribute("data-no-analytics")) return null;
    if (a.provider === "vercel") {
      // Vercel Web Analytics (served from this website's own domain).
      window.va =
        window.va ||
        function () {
          (window.vaq = window.vaq || []).push(Array.prototype.slice.call(arguments));
        };
      addScript(a.scriptUrl || VERCEL_SCRIPT);
      return function (name, props) {
        window.va("event", props ? { name: name, data: props } : { name: name });
      };
    }
    if (a.provider === "plausible") {
      window.plausible =
        window.plausible ||
        function () {
          (window.plausible.q = window.plausible.q || []).push(arguments);
        };
      addScript(a.scriptUrl || PLAUSIBLE_SCRIPT, { "data-domain": a.domain || window.location.hostname });
      return function (name, props) {
        if (props) window.plausible(name, { props: props });
        else window.plausible(name);
      };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Error reports
  // ------------------------------------------------------------------
  var MAX_REPORTS = 5;

  // A same-origin address as its path only (no query or #), else "other site".
  function ownPath(url) {
    try {
      var u = new URL(url, window.location.href);
      return u.origin === window.location.origin ? u.pathname : "other site";
    } catch (e) {
      return "unknown";
    }
  }

  // Only a standard kind of error ("TypeError"): a name of letters ending in
  // "Error", never its message.
  function kindOf(error) {
    var name = error && typeof error.name === "string" ? error.name : "";
    return /^[A-Za-z]{0,31}Error$/.test(name) ? name : "Error";
  }

  // The first place in the stack that is on this website: "/js/x.js:12:5".
  function placeInStack(error) {
    var stack = error && typeof error.stack === "string" ? error.stack : "";
    var m = /(https?:\/\/[^\s)]+?):(\d+):(\d+)/.exec(stack);
    return m && ownPath(m[1]) !== "other site" ? ownPath(m[1]) + ":" + m[2] + ":" + m[3] : "unknown";
  }

  // What is sent for one error event: { kind, source } only.
  function describe(e) {
    if (e && e.type === "unhandledrejection") return { kind: kindOf(e.reason), source: placeInStack(e.reason) };
    var target = e && e.target;
    if (target && target !== window && (target.src || target.href)) {
      return { kind: "File failed to load", source: ownPath(target.src || target.href) };
    }
    var where = e && e.filename ? ownPath(e.filename) : "unknown";
    if (where !== "other site" && where !== "unknown" && e.lineno) where += ":" + e.lineno + ":" + (e.colno || 0);
    return { kind: kindOf(e && e.error), source: where };
  }

  function startErrorReports(config, send) {
    var queue = window.__prErrors || [];
    var seen = {};
    var sent = 0;
    function report(event, props) {
      var key = event + "|" + JSON.stringify(props);
      if (seen[key] || sent >= MAX_REPORTS) return;
      seen[key] = true;
      sent++;
      props.page = window.location.pathname;
      try {
        send(event, props);
      } catch (e) {
        /* reporting must never break the page */
      }
    }
    if (config.loadProblem) report(EVENTS.SETTINGS_FAILED, { reason: config.loadProblem });
    var waiting = queue.slice();
    queue.length = 0;
    // From now on the page's error listener hands errors straight here.
    queue.push = function (e) {
      report(EVENTS.SCRIPT_ERROR, describe(e));
      return 0;
    };
    waiting.forEach(queue.push);
  }

  function stopKeepingErrors() {
    var queue = window.__prErrors;
    if (!queue) return;
    queue.length = 0;
    queue.push = function () {
      return 0;
    };
  }

  var ready = (window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null))
    .then(function (config) {
      var send = start(config);
      if (send && config.errorReports && config.errorReports.enabled) startErrorReports(config, send);
      else stopKeepingErrors();
      return send;
    })
    .catch(function () {
      stopKeepingErrors();
      return null;
    });

  function track(name) {
    ready.then(function (send) {
      if (!send) return;
      try {
        send(name);
      } catch (e) {
        /* counting must never break the page */
      }
    });
  }

  window.SiteAnalytics = { EVENTS: EVENTS, track: track };
})();
