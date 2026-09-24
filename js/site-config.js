// Premium Restoration — site settings loader.
//
// Reads /site-config.json (the one place for owner-editable settings, see
// README "Site settings") and applies it to the page:
//
//   data-fill="owner.legalName"       text is set to the value
//   data-show-if="owner.legalName"    shown only when the value is filled in
//   data-show-unless="leadForm.endpoint"  shown only when it is NOT filled in
//
// Elements with data-show-if start out `hidden` in the HTML, so an unfilled
// value never shows a placeholder. If the settings file can't be loaded, the
// safe defaults below apply (price estimator off, email-app lead form).
//
// Other scripts use: SiteConfig.ready.then(function (config) { ... })

(function () {
  "use strict";

  var DEFAULTS = {
    priceEstimator: { enabled: false },
    leadForm: { endpoint: "", serviceName: "", servicePrivacyUrl: "" },
    owner: { legalName: "", contactAddress: "" },
    privacy: { responsePeriod: "" },
  };

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalize(raw) {
    raw = raw || {};
    var pe = raw.priceEstimator || {};
    var lf = raw.leadForm || {};
    var owner = raw.owner || {};
    var privacy = raw.privacy || {};
    var endpoint = clean(lf.endpoint);
    return {
      loaded: true,
      priceEstimator: { enabled: pe.enabled === true },
      leadForm: {
        // Only an https:// address is used; anything else keeps the email-app form.
        endpoint: /^https:\/\/[^\s]+$/.test(endpoint) ? endpoint : "",
        serviceName: clean(lf.serviceName) || "our form service provider",
        servicePrivacyUrl: /^https:\/\//.test(clean(lf.servicePrivacyUrl)) ? clean(lf.servicePrivacyUrl) : "",
      },
      owner: { legalName: clean(owner.legalName), contactAddress: clean(owner.contactAddress) },
      privacy: { responsePeriod: clean(privacy.responsePeriod) },
    };
  }

  function lookup(config, path) {
    return path.split(".").reduce(function (obj, key) {
      return obj && obj[key] !== undefined ? obj[key] : "";
    }, config);
  }

  function apply(config, scope) {
    scope = scope || document;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-fill]"), function (el) {
      el.textContent = lookup(config, el.getAttribute("data-fill"));
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-fill-href]"), function (el) {
      var href = lookup(config, el.getAttribute("data-fill-href"));
      if (href) el.setAttribute("href", href);
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-show-if]"), function (el) {
      el.hidden = !lookup(config, el.getAttribute("data-show-if"));
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-show-unless]"), function (el) {
      el.hidden = !!lookup(config, el.getAttribute("data-show-unless"));
    });
  }

  var script = document.currentScript;
  var url = script && script.src ? new URL("../site-config.json", script.src).href : "site-config.json";

  var loaded = fetch(url, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(normalize)
    .catch(function () {
      var fallback = normalize(DEFAULTS);
      fallback.loaded = false;
      return fallback;
    });

  var domReady = new Promise(function (resolve) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve);
    } else {
      resolve();
    }
  });

  var ready = Promise.all([loaded, domReady]).then(function (results) {
    var config = results[0];
    apply(config);
    document.documentElement.setAttribute("data-config", config.loaded ? "loaded" : "defaults");
    return config;
  });

  window.SiteConfig = { ready: ready, apply: apply };
})();
