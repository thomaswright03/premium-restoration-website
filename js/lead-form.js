// Premium Restoration — the Get a Quote form (contact.html).
//
// With leadForm.endpoint set in site-config.json, the request is sent there
// (Formspree-style: POST, JSON reply, 2xx = sent). Without it, the visitor's
// own email app opens with the request filled in. "Request sent" is shown
// only after the form service confirms it; a failure keeps what was typed
// and offers the email app and the phone number instead.

(function () {
  "use strict";

  var SUMMARY_KEY = "pr_estimate_summary";
  var REQUIRED = ["name", "phone", "email"];
  var Business = window.BusinessInfo;
  var PHONE = Business.PHONE;
  var EMAIL = Business.EMAIL;
  var configReady = window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null);

  // Anonymous event counts, only when switched on in site-config.json
  // (js/analytics.js, a deferred script, so it is looked up when needed).
  // key: a name from SiteAnalytics.EVENTS.
  /** @param {string} key */
  function track(key) {
    var analytics = window.SiteAnalytics;
    if (analytics && analytics.EVENTS[key]) analytics.track(analytics.EVENTS[key]);
  }

  /** @param {string} id */
  function byId(id) {
    return document.getElementById(id);
  }

  /** @param {string} id */
  function value(id) {
    var el = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (byId(id));
    if (!el) return "";
    if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex].text;
    return el.value.trim();
  }

  /**
   * @param {string} href
   * @param {string} text
   */
  function link(href, text) {
    var a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
  }

  /** @param {string} text */
  function strong(text) {
    var s = document.createElement("strong");
    s.textContent = text;
    return s;
  }

  // ---------- estimate carried over from the chat ----------
  /** @param {HTMLTextAreaElement | null} message */
  function prefillFromEstimate(message) {
    if (!/[?&]from=estimate\b/.test(window.location.search)) return;
    var summary = null;
    try {
      summary = sessionStorage.getItem(SUMMARY_KEY);
    } catch (e) {
      summary = null;
    }
    // Counted here, once the Get a Quote page has opened, so it isn't lost
    // when the estimate page navigates away.
    track("CONTACT_ABOUT_ESTIMATE");
    if (summary && message && !message.value.trim()) {
      message.value = summary.slice(0, Number(message.getAttribute("maxlength")) || summary.length);
      var note = byId("estimate-prefill-note");
      if (note) note.hidden = false;
    }
  }

  // ---------- character counter for the project details ----------
  // Returns a function that refreshes it (the field stops at its maxlength).
  /** @param {HTMLTextAreaElement | null} message */
  function initCounter(message) {
    var counter = byId("message-count");
    var counterLive = byId("message-count-live");
    /** @type {string | null} */
    var lastAnnounced = null;
    function update() {
      if (!message || !counter) return;
      var max = Number(message.getAttribute("maxlength")) || 2000;
      var used = message.value.length;
      var left = max - used;
      counter.textContent =
        used.toLocaleString("en-US") +
        " / " +
        max.toLocaleString("en-US") +
        " characters" +
        (left <= 200 ? " — " + left.toLocaleString("en-US") + " left" : "");
      counter.classList.toggle("is-near-limit", left <= 200);
      // Screen readers hear only when the limit gets close, not every keystroke.
      var step = left <= 0 ? "full" : left <= 50 ? "50" : left <= 200 ? "200" : null;
      if (counterLive && step !== lastAnnounced) {
        lastAnnounced = step;
        counterLive.textContent = !step
          ? ""
          : left <= 0
            ? "Project details are at the " + max.toLocaleString("en-US") + "-character limit."
            : left + " characters left in project details.";
      }
    }
    if (message) {
      message.addEventListener("input", update);
      update();
    }
    return update;
  }

  // ---------- validation ----------
  /**
   * @param {string} id
   * @param {string | null} text
   */
  function setError(id, text) {
    var input = byId(id);
    var err = byId(id + "-error");
    if (err) {
      err.textContent = text || "";
      err.hidden = !text;
    }
    if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
  }

  function validate() {
    /** @type {Record<string, string>} */
    var errors = {};
    if (!value("name")) errors.name = "Enter your name.";
    var phone = value("phone");
    var digits = phone.replace(/\D/g, "");
    if (!phone) errors.phone = "Enter a phone number we can call you on.";
    else if (!/^[0-9+().\-\s]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
      errors.phone = "Enter a valid phone number, e.g. " + PHONE + ".";
    }
    var email = value("email");
    if (!email) errors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      errors.email = "Enter a valid email address, e.g. name@example.com.";
    REQUIRED.forEach(function (id) {
      setError(id, errors[id]);
    });
    return errors;
  }

  // ---------- status messages ----------
  /**
   * @param {string} kind "info", "success" or "error"
   * @param {(string | Node)[]} nodes
   */
  function showStatus(kind, nodes) {
    var status = byId("form-status");
    if (!status) return;
    status.className = "form-status is-" + kind;
    status.innerHTML = "";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      status.appendChild(typeof n === "string" ? document.createTextNode(n) : n);
    }
    status.hidden = false;
    status.focus({ preventScroll: false });
  }

  // ---------- sending ----------
  function body() {
    return (
      "Name: " +
      value("name") +
      "\nPhone: " +
      value("phone") +
      "\nEmail: " +
      value("email") +
      "\nService: " +
      value("service") +
      "\n\nProject details:\n" +
      value("message")
    );
  }

  // The request as an email in the visitor's own email app: the only way
  // to send it when no form service is set, and the fallback when sending
  // through the form service fails.
  function mailtoHref() {
    return (
      Business.EMAIL_HREF +
      "?subject=" +
      encodeURIComponent("Bathroom quote request from " + value("name")) +
      "&body=" +
      encodeURIComponent(body())
    );
  }

  function sendByEmailApp() {
    var href = mailtoHref();
    var again = link(href, "open it again");
    again.id = "mailto-link";
    showStatus("info", [
      "Your email app should now open with your request filled in. ",
      strong("Please press Send in your email app"),
      " — we don't receive anything until you do. If nothing opened, ",
      again,
      ", email us at ",
      link(Business.EMAIL_HREF, EMAIL),
      " or call ",
      link(Business.PHONE_HREF, PHONE),
      ".",
    ]);
    track("QUOTE_EMAIL_OPENED");
    window.location.href = href;
  }

  /**
   * @param {HTMLFormElement} form
   * @param {() => void} updateCounter
   */
  function showSent(form, updateCounter) {
    form.reset();
    updateCounter();
    try {
      sessionStorage.removeItem(SUMMARY_KEY);
    } catch (e) {
      /* ignore */
    }
    var note = byId("estimate-prefill-note");
    if (note) note.hidden = true;
    track("QUOTE_REQUEST_SENT");
    showStatus("success", [
      strong("Request sent."),
      " Thank you — we've received your request and will get back to you as soon as we can. If it's urgent, call ",
      link(Business.PHONE_HREF, PHONE),
      ".",
    ]);
  }

  function showNotSent() {
    track("QUOTE_REQUEST_FAILED");
    var fallback = link(mailtoHref(), "send it with your email app instead");
    fallback.id = "mailto-fallback";
    showStatus("error", [
      strong("Sorry, your request wasn't sent."),
      " Nothing you entered has been lost. Please try again, ",
      fallback,
      " (it opens a filled-in email that you then send), call us at ",
      link(Business.PHONE_HREF, PHONE),
      " or email ",
      link(Business.EMAIL_HREF, EMAIL),
      ".",
    ]);
  }

  // POSTs the form to the form service; 15 seconds without a reply counts as a failure.
  /**
   * @param {HTMLFormElement} form
   * @param {string} endpoint the form service's https:// address
   */
  function post(form, endpoint) {
    var data = new FormData(form);
    data.set("service", value("service"));
    data.set("_subject", "Bathroom quote request from " + value("name"));
    var controller = "AbortController" in window ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, 15000);
    var honeypot = /** @type {HTMLInputElement | null} */ (byId("company-website"));
    var request =
      honeypot && honeypot.value
        ? Promise.resolve({ ok: true, status: 200 })
        : fetch(endpoint, {
            method: "POST",
            body: data,
            headers: { Accept: "application/json" },
            signal: controller ? controller.signal : undefined,
          });
    return request.then(
      function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
      },
      function (err) {
        clearTimeout(timer);
        throw err;
      },
    );
  }

  function initLeadForm() {
    var form = /** @type {HTMLFormElement | null} */ (byId("lead-form"));
    if (form) wireLeadForm(form);
  }

  /** @param {HTMLFormElement} form */
  function wireLeadForm(form) {
    var submit = /** @type {HTMLButtonElement} */ (byId("lead-submit"));
    var message = /** @type {HTMLTextAreaElement | null} */ (byId("message"));
    prefillFromEstimate(message);
    var updateCounter = initCounter(message);
    var sending = false;

    REQUIRED.forEach(function (id) {
      var input = byId(id);
      if (input) {
        input.addEventListener("input", function () {
          setError(id, null);
        });
      }
    });

    /** @param {string} endpoint */
    function sendToEndpoint(endpoint) {
      if (sending) return;
      sending = true;
      var original = submit.innerHTML;
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Sending…";
      showStatus("info", ["Sending your request…"]);
      post(form, endpoint)
        .then(function () {
          showSent(form, updateCounter);
        }, showNotSent)
        .then(function () {
          sending = false;
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
          submit.innerHTML = original;
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var errors = validate();
      var first = REQUIRED.filter(function (id) {
        return errors[id];
      })[0];
      if (first) {
        var field = byId(first);
        if (field) field.focus();
        return;
      }
      configReady.then(function (config) {
        if (config && config.leadForm.paused) return; // "please call us" mode: the form is hidden
        var endpoint = config && config.leadForm.endpoint;
        if (endpoint) sendToEndpoint(endpoint);
        else sendByEmailApp();
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initLeadForm);
  else initLeadForm();
})();
