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
// It also hands the published prices ("prices") to js/bathroom-pricing.js
// and writes them into the page text, so the owner changes a price in one
// place. Missing or invalid prices keep the price estimator off.
//
// Other scripts use: SiteConfig.ready.then(function (config) { ... })
//
// normalize() also loads in Node, so the unit tests can check the committed
// site-config.json the same way the pages read it.

(function () {
  "use strict";

  var isNode = typeof module === "object" && module.exports && typeof require === "function";
  // Published prices are checked with js/bathroom-pricing.js (loaded before
  // this script on every page that shows or uses a price).
  var Pricing = isNode ? require("./bathroom-pricing.js") : window.BathroomPricing || null;

  var DEFAULTS = {
    priceEstimator: { enabled: false },
    leadForm: { enabled: true, endpoint: "", serviceName: "", servicePrivacyUrl: "" },
    owner: { legalName: "", contactAddress: "" },
    privacy: { responsePeriod: "" },
    analytics: { enabled: false, provider: "", domain: "", scriptUrl: "", servicePrivacyUrl: "" },
    estimates: { validForDays: null },
  };

  // How long the prices on an estimate or quote PDF are held, in days: a
  // whole number from 1 to 365 set by the owner, or null (not set) — then
  // the PDFs print no "held until" date. Returns a message if the setting
  // can't be used.
  function validForDaysProblem(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "number" && Math.floor(value) === value && value >= 1 && value <= 365) return "";
    return "estimates.validForDays must be a whole number of days from 1 to 365 (no quotes), or null if not set.";
  }

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

  /** @returns {SiteConfigData} */
  function normalize(raw) {
    raw = raw || {};
    var pe = raw.priceEstimator || {};
    var lf = raw.leadForm || {};
    var owner = raw.owner || {};
    var privacy = raw.privacy || {};
    var an = raw.analytics || {};
    var est = raw.estimates || {};
    var provider = clean(an.provider).toLowerCase();
    var knownProvider = Object.prototype.hasOwnProperty.call(ANALYTICS_PROVIDERS, provider);
    var scriptUrl = clean(an.scriptUrl);
    var endpoint = clean(lf.endpoint);
    var priceCheck = Pricing ? Pricing.validatePublishedPrices(raw.prices) : null;
    var pricesOk = !!(priceCheck && priceCheck.valid);
    return {
      loaded: true,
      // The estimator needs valid published prices: without them it stays
      // off, so a wrong price is never shown.
      priceEstimator: { enabled: pe.enabled === true && pricesOk },
      prices: pricesOk ? priceCheck.prices : null,
      priceProblems: priceCheck ? priceCheck.errors : [],
      leadForm: {
        // false = "please call us" mode: the Get a Quote page shows the phone
        // number and email instead of the form. Anything but false keeps the form.
        enabled: lf.enabled !== false,
        paused: lf.enabled === false,
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
      // Unset or unusable: no "prices held until" date is printed.
      estimates: {
        validForDays:
          est.validForDays !== null && est.validForDays !== undefined && !validForDaysProblem(est.validForDays)
            ? est.validForDays
            : null,
      },
    };
  }

  if (isNode) {
    module.exports = {
      DEFAULTS: DEFAULTS,
      GENERIC_FORM_SERVICE: GENERIC_FORM_SERVICE,
      normalize: normalize,
      formServiceName: formServiceName,
      validForDaysProblem: validForDaysProblem,
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
    // Published prices in page text: <span data-price="Cabinet_Price">$60</span>.
    // The files carry the prices as of the last `npm run pages`; this makes
    // sure visitors see the prices in site-config.json right now.
    if (Pricing && config.prices) {
      Array.prototype.forEach.call(scope.querySelectorAll("[data-price]"), function (el) {
        var value = Pricing.DEFAULT_PRICES[el.getAttribute("data-price")];
        if (typeof value === "number" && isFinite(value)) el.textContent = Pricing.shortMoney(value);
      });
    }
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

  var script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
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
    if (Pricing && config.prices) Pricing.setPublishedPrices(config.prices);
    if (Pricing && config.loaded && config.priceProblems.length && window.console) {
      console.warn("site-config.json prices can't be used, so the estimator is off: " + config.priceProblems.join(" "));
    }
    apply(config);
    document.documentElement.setAttribute("data-config", config.loaded ? "loaded" : "defaults");
    return config;
  });

  window.SiteConfig = { ready: ready, apply: apply };
})();
