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
//
// normalize() also loads in Node, so the unit tests can check the committed
// site-config.json the same way the pages read it.

(function () {
  "use strict";

  var DEFAULTS = {
    priceEstimator: { enabled: false },
    leadForm: { endpoint: "", serviceName: "", servicePrivacyUrl: "" },
    owner: { legalName: "", contactAddress: "" },
    privacy: { responsePeriod: "" },
    analytics: { enabled: false, provider: "", domain: "", scriptUrl: "", servicePrivacyUrl: "" },
  };

  // Visitor-count services the site can use (see js/analytics.js). Both
  // count without cookies and show only totals.
  var ANALYTICS_PROVIDERS = { vercel: "Vercel Web Analytics", plausible: "Plausible Analytics" };

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  // Shown when a form service is connected but not named in the settings.
  var GENERIC_FORM_SERVICE = "our form service provider";

  // Well-known form services, so the form text and the Privacy Notice name
  // the right one even if leadForm.serviceName is left blank.
  var KNOWN_FORM_SERVICES = {
    "formspree.io": "Formspree",
    "getform.io": "Getform",
    "usebasin.com": "Basin",
    "formsubmit.co": "FormSubmit",
    "web3forms.com": "Web3Forms",
  };

  function formServiceName(endpoint) {
    var m = /^https:\/\/([^/?#:]+)/i.exec(endpoint || "");
    if (!m) return "";
    var host = m[1].toLowerCase();
    var match = Object.keys(KNOWN_FORM_SERVICES).filter(function (domain) {
      return host === domain || host.slice(-(domain.length + 1)) === "." + domain;
    })[0];
    return match ? KNOWN_FORM_SERVICES[match] : "";
  }

  function normalize(raw) {
    raw = raw || {};
    var pe = raw.priceEstimator || {};
    var lf = raw.leadForm || {};
    var owner = raw.owner || {};
    var privacy = raw.privacy || {};
    var an = raw.analytics || {};
    var provider = clean(an.provider).toLowerCase();
    var knownProvider = Object.prototype.hasOwnProperty.call(ANALYTICS_PROVIDERS, provider);
    var scriptUrl = clean(an.scriptUrl);
    var endpoint = clean(lf.endpoint);
    return {
      loaded: true,
      priceEstimator: { enabled: pe.enabled === true },
      leadForm: {
        // Only an https:// address is used; anything else keeps the email-app form.
        endpoint: /^https:\/\/[^\s]+$/.test(endpoint) ? endpoint : "",
        serviceName: clean(lf.serviceName) || formServiceName(endpoint) || GENERIC_FORM_SERVICE,
        servicePrivacyUrl: /^https:\/\//.test(clean(lf.servicePrivacyUrl)) ? clean(lf.servicePrivacyUrl) : "",
      },
      owner: { legalName: clean(owner.legalName), contactAddress: clean(owner.contactAddress) },
      privacy: { responsePeriod: clean(privacy.responsePeriod) },
      // Off unless switched on with a provider this site knows how to use.
      analytics: {
        enabled: an.enabled === true && knownProvider,
        provider: knownProvider ? provider : "",
        serviceName: knownProvider ? ANALYTICS_PROVIDERS[provider] : "",
        domain: clean(an.domain),
        scriptUrl: /^(https:\/\/|\/)\S*$/.test(scriptUrl) ? scriptUrl : "",
        servicePrivacyUrl: /^https:\/\//.test(clean(an.servicePrivacyUrl)) ? clean(an.servicePrivacyUrl) : "",
      },
    };
  }

  if (typeof module === "object" && module.exports) {
    module.exports = {
      DEFAULTS: DEFAULTS,
      ANALYTICS_PROVIDERS: ANALYTICS_PROVIDERS,
      GENERIC_FORM_SERVICE: GENERIC_FORM_SERVICE,
      normalize: normalize,
      formServiceName: formServiceName,
    };
    return;
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
