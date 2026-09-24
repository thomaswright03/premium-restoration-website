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
// Nothing is loaded or counted when it is off, on the admin tool (<html
// data-no-analytics>), or when the browser sends Do Not Track or Global
// Privacy Control. The Privacy Notice describes it only when it is on.
//
// Other scripts call: SiteAnalytics.track(SiteAnalytics.EVENTS.ESTIMATE_STARTED)

(function () {
  "use strict";

  var EVENTS = {
    ESTIMATE_STARTED: "Estimate started",
    ESTIMATE_COMPLETED: "Estimate completed",
    ESTIMATE_PDF_FAILED: "Estimate PDF failed",
    CONTACT_ABOUT_ESTIMATE: "Contact Us About This",
    QUOTE_REQUEST_SENT: "Quote request sent",
    QUOTE_REQUEST_FAILED: "Quote request failed",
    QUOTE_EMAIL_OPENED: "Quote email opened",
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
          (window.vaq = window.vaq || []).push(arguments);
        };
      addScript(a.scriptUrl || VERCEL_SCRIPT);
      return function (name) {
        window.va("event", { name: name });
      };
    }
    if (a.provider === "plausible") {
      window.plausible =
        window.plausible ||
        function () {
          (window.plausible.q = window.plausible.q || []).push(arguments);
        };
      addScript(a.scriptUrl || PLAUSIBLE_SCRIPT, { "data-domain": a.domain || window.location.hostname });
      return function (name) {
        window.plausible(name);
      };
    }
    return null;
  }

  var ready = (window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null)).then(start).catch(function () {
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
