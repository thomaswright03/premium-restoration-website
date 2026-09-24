// Premium Restoration — internal bathroom quoting tool.
//
// SECURITY NOTE: the password gate is client-side only (there is no
// backend). Anyone who reads this file can find the password and skip the
// login. It only deters casual access — it is not real authentication.
//
// Quotes, prices and the retention log live in this browser's localStorage.
// Prices and the calculation itself come from js/bathroom-pricing.js, the
// same code the public estimate uses.
//
// Screens have their own URL (#/dashboard, #/details, #/prices), so the
// browser's Back/Forward buttons move between them. A quote being edited is
// kept as a draft in this browser, so reloading the page never loses what was
// entered, and nothing unsaved is thrown away without asking first.

(function () {
  "use strict";

  var Pricing = window.BathroomPricing;
  var money = Pricing.money;

  var ADMIN_PASSWORD = "templein26)";
  var AUTH_KEY = "pr_admin_authed";
  var QUOTES_KEY = "pr_quotes";
  var DRAFT_KEY = "pr_quote_draft";
  var RETENTION_LOG_KEY = "pr_retention_log";
  var Business = window.BusinessInfo;
  var configReady = window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null);

  // Retention for quotes that didn't lead to work, in days. The public
  // Privacy Notice says enquiries are kept for "about a month"; keep the two
  // in step.
  var QUOTE_RETENTION_DAYS = 30;

  // Job-value thresholds for Utah's small-project exemption from contractor
  // licensing (Utah Code 58-55-305(1)(h); Utah is assumed, not confirmed).
  // They only show a warning on the quote and never change a price. Change
  // them only on a lawyer's advice.
  var JOB_VALUE_CHECKPOINTS = { affirmation: 3000, exemptionCap: 7000 };

  var LICENCE_NOTES = {
    Fixtures:
      "No contractor licence is currently held. Toilets, sinks, showers and bathtubs also need plumbing work: agree who will do it with the customer before any work is agreed.",
    Plumbing:
      "No contractor licence is currently held. Get legal advice on who may do plumbing work before quoting it, and tell the customer who will do it before any work is agreed.",
    Electrical:
      "No contractor licence is currently held. Get legal advice on who may do electrical work before quoting it, and tell the customer who will do it before any work is agreed.",
  };

  // "new" is the old address of the first quote step; it now opens the one quote screen.
  var ROUTES = { dashboard: "screen-dashboard", details: "screen-quote", new: "screen-quote", prices: "screen-rates" };

  // ------------------------------------------------------------------
  // Storage. Every write is checked: if the browser refuses (storage full,
  // blocked, private mode), the person is told and nothing on screen is lost.
  // ------------------------------------------------------------------
  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* nothing to do */
    }
  }

  function getQuotes() {
    var quotes = readJson(QUOTES_KEY, []);
    return Array.isArray(quotes) ? quotes : [];
  }

  function saveQuotes(quotes) {
    return writeJson(QUOTES_KEY, quotes);
  }

  var STORAGE_ERROR =
    "Couldn't save in this browser — its storage is full or blocked (for example in a private window). Nothing on screen has been lost. Try again, free up space by deleting old quotes, or use Export Quotes to keep a copy.";

  // ------------------------------------------------------------------
  // Messages
  // ------------------------------------------------------------------
  // Messages sit at the top of the screen in their own space (never over a
  // button) and stay until dismissed, replaced, or the screen changes.
  var toastRoute = null;

  function toast(text, route) {
    document.getElementById("admin-toast").textContent = text;
    document.getElementById("admin-toast-box").hidden = false;
    toastRoute = route || currentRoute;
  }

  function hideToast() {
    document.getElementById("admin-toast-box").hidden = true;
    document.getElementById("admin-toast").textContent = "";
    toastRoute = null;
  }

  function alertError(text) {
    var el = document.getElementById("admin-alert");
    el.textContent = text || "";
    el.hidden = !text;
    if (text) el.scrollIntoView({ block: "nearest" });
  }

  // ------------------------------------------------------------------
  // Confirmation dialog, in the site's own style. Cancel has focus to start
  // with, Escape cancels, and focus goes back to what opened it.
  //   askDialog({ title, message, actions: [{ id, label, style }], cancelLabel })
  //   resolves to the chosen action's id, or null for Cancel / Escape.
  // ------------------------------------------------------------------
  var dialogPending = null;

  function askDialog(options) {
    var dialog = document.getElementById("admin-dialog");
    if (dialogPending) return Promise.resolve(null);
    if (typeof dialog.showModal !== "function") {
      // Very old browsers: fall back to the plain confirm box.
      var ok = window.confirm(options.title + "\n\n" + (options.message || ""));
      return Promise.resolve(ok && options.actions && options.actions[0] ? options.actions[0].id : null);
    }
    var opener = document.activeElement;
    document.getElementById("admin-dialog-title").textContent = options.title;
    document.getElementById("admin-dialog-message").textContent = options.message || "";
    var actions = document.getElementById("admin-dialog-actions");
    actions.innerHTML = "";
    var cancel = el("button", "btn btn-outline-dark", options.cancelLabel || "Cancel");
    cancel.type = "submit";
    cancel.value = "";
    cancel.setAttribute("data-dialog-action", "cancel");
    (options.actions || []).forEach(function (action) {
      var btn = el(
        "button",
        "btn " +
          (action.style === "danger" ? "btn-danger" : action.style === "primary" ? "btn-primary" : "btn-outline-dark"),
        action.label,
      );
      btn.type = "submit";
      btn.value = action.id;
      actions.appendChild(btn);
    });
    actions.appendChild(cancel);
    dialog.returnValue = "";
    dialogPending = new Promise(function (resolve) {
      dialog.addEventListener(
        "close",
        function () {
          var choice = dialog.returnValue || null;
          dialogPending = null;
          var back = options.returnFocus || opener;
          if (back && document.contains(back) && back.getClientRects().length) back.focus();
          resolve(choice);
        },
        { once: true },
      );
    });
    dialog.showModal();
    cancel.focus();
    return dialogPending;
  }

  function confirmAction(title, message, label, style) {
    return askDialog({
      title: title,
      message: message,
      actions: [{ id: "ok", label: label, style: style || "danger" }],
    }).then(function (choice) {
      return choice === "ok";
    });
  }

  function confirmDiscardQuote(d) {
    return confirmAction(
      "Discard unsaved changes?",
      "Your changes to " + describeDraft(d) + " haven't been saved. Discarding them can't be undone.",
      "Discard changes",
    );
  }

  function describeDraft(d) {
    return d && d.address ? "the quote for " + d.address : "a new quote";
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "unknown date";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
  function isAuthed() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "true";
    } catch (e) {
      return window.__prAuthed === true;
    }
  }

  function setAuthed(value) {
    try {
      if (value) sessionStorage.setItem(AUTH_KEY, "true");
      else sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {
      window.__prAuthed = value;
    }
  }

  // ------------------------------------------------------------------
  // Routing
  // ------------------------------------------------------------------
  var currentRoute = null;

  function routeFromHash() {
    var m = /^#\/(\w+)/.exec(window.location.hash || "");
    return m && ROUTES[m[1]] ? m[1] : "dashboard";
  }

  function showScreen(id) {
    Array.prototype.forEach.call(document.querySelectorAll(".admin-screen"), function (el) {
      el.hidden = el.id !== id;
    });
    window.scrollTo(0, 0);
    var h1 = document.querySelector("#" + id + " h1");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }

  function navigate(route, options) {
    var hash = "#/" + route;
    if (window.location.hash === hash) {
      render(route);
      return;
    }
    if (options && options.replace) {
      history.replaceState(null, "", hash);
      render(route);
    } else {
      window.location.hash = hash; // triggers hashchange -> render
    }
  }

  function render(route) {
    if (!isAuthed()) {
      showScreen("screen-login");
      currentRoute = null;
      return;
    }
    if (route === "new") {
      route = "details";
      history.replaceState(null, "", "#/details");
    }
    // Leaving the quote or the prices with unsaved changes (e.g. the
    // browser's Back button) asks first; until then, stay where we are.
    var leavingEditor = currentRoute === "details" && route !== "details";
    var leavingPrices = currentRoute === "prices" && route !== "prices";
    if ((leavingEditor && draft && isDirty()) || (leavingPrices && ratesDirty())) {
      var from = currentRoute;
      history.replaceState(null, "", "#/" + from);
      (leavingEditor ? confirmDiscardQuote(draft) : confirmDiscardPrices()).then(function (discard) {
        if (!discard || currentRoute !== from) return;
        if (leavingEditor) clearDraft();
        ratesBaseline = null;
        currentRoute = null;
        navigate(route);
      });
      return;
    }
    if (leavingEditor) clearDraft();
    if (leavingPrices) ratesBaseline = null;

    if (route === "details" && !draft) {
      route = "dashboard";
      history.replaceState(null, "", "#/dashboard");
    }

    alertError("");
    if (toastRoute && toastRoute !== route) hideToast();
    currentRoute = route;
    if (route === "dashboard") renderDashboard();
    if (route === "details") renderEditor();
    if (route === "prices") renderRatesForm();
    showScreen(ROUTES[route]);
  }

  // ------------------------------------------------------------------
  // Draft (the quote being created or edited)
  // ------------------------------------------------------------------
  var draft = null;

  function snapshot(d) {
    return JSON.stringify({
      address: d.address,
      customer: cleanCustomer(d.customer),
      values: d.values,
      scope: d.scope,
    });
  }

  // Optional customer details kept with a quote.
  function cleanCustomer(c) {
    c = c || {};
    function text(v) {
      return typeof v === "string" ? v.trim() : "";
    }
    return { name: text(c.name), phone: text(c.phone), email: text(c.email) };
  }

  function customerSummary(c) {
    c = cleanCustomer(c);
    return [c.name, c.phone, c.email].filter(Boolean).join(" · ");
  }

  function hasUnsavedDraft(stored) {
    return !!(stored && stored.id && snapshot(stored) !== stored.baseline);
  }

  function isDirty() {
    return !!draft && snapshot(draft) !== draft.baseline;
  }

  var draftWarned = false;

  function persistDraft() {
    if (!draft) return;
    if (!writeJson(DRAFT_KEY, draft) && !draftWarned) {
      draftWarned = true;
      alertError(
        "This browser isn't letting us keep a backup of this quote while you work, so don't reload the page until you've saved it.",
      );
    }
  }

  // The unsaved quote kept in this browser (shared by every tab), if any.
  function readDraft() {
    var d = readJson(DRAFT_KEY, null);
    if (!d || !d.id) return null;
    if (!d.customer) {
      // Saved before customer details existed: compare like with like.
      d.customer = cleanCustomer();
      try {
        var base = JSON.parse(d.baseline);
        d.baseline = snapshot({ address: base.address, customer: null, values: base.values, scope: base.scope });
      } catch (e) {
        /* no usable baseline: treated as changed */
      }
    }
    return d;
  }

  function clearDraft() {
    draft = null;
    removeKey(DRAFT_KEY);
  }

  function newDraft() {
    var d = {
      id: "q_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      isNew: true,
      address: "",
      customer: cleanCustomer(),
      values: {},
      scope: {},
    };
    d.baseline = snapshot(d);
    return d;
  }

  var VALUE_KEYS = ["Bathroom_Width_Ft", "Bathroom_Length_Ft", "Bathroom_Height_Ft", "Electrical_Points"]
    .concat(
      Pricing.FIXTURES.map(function (f) {
        return f.key;
      }),
    )
    .concat(["No_Stack_Surcharge_Included", "Bad_Valve_Surcharge_Included"]);

  var DIMENSION_KEYS = Pricing.DIMENSIONS.map(function (d) {
    return d.key;
  });

  function draftFromQuote(quote) {
    var bathroom = (quote.data && quote.data.bathroom) || {};
    var jobValues = bathroom.jobValues || {};
    var values = {};
    VALUE_KEYS.forEach(function (key) {
      var v = jobValues[key];
      if (typeof v === "boolean") values[key] = v;
      else if (v !== undefined && v !== null && v !== "" && v !== 0) values[key] = String(v);
    });
    var legacy = Pricing.isLegacyQuoteData(bathroom);
    var d = {
      id: quote.id,
      isNew: false,
      address: quote.address || "",
      customer: cleanCustomer(quote.customer),
      values: values,
      scope: legacy ? {} : Object.assign({}, bathroom.scope || {}),
      createdAt: quote.createdAt,
      legacy: legacy
        ? {
            total: Number(bathroom.totalPrice) || 0,
            floorSqFt: Number(jobValues.Bathroom_SqFt) || 0,
            wallSqFt: Number(jobValues.Wall_SqFt) || 0,
            hadDimensions: !!(jobValues.Bathroom_Width_Ft || jobValues.Bathroom_Length_Ft),
          }
        : null,
    };
    d.baseline = snapshot(d);
    return d;
  }

  function cancelQuote() {
    (isDirty() ? confirmDiscardQuote(draft) : Promise.resolve(true)).then(function (discard) {
      if (!discard) return;
      clearDraft();
      currentRoute = "dashboard";
      navigate("dashboard");
    });
  }

  // ------------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------------
  // Quotes marked as having led to work are customer records: never
  // counted as past retention or deleted by the bulk clean-up.
  function isPastRetention(quote) {
    if (quote.ledToWork === true) return false;
    var last = new Date(quote.updatedAt || quote.createdAt).getTime();
    if (isNaN(last)) return false;
    return Date.now() - last > QUOTE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  }

  function getRetentionLog() {
    var log = readJson(RETENTION_LOG_KEY, []);
    return Array.isArray(log) ? log : [];
  }

  function addRetentionLogEntry(type, deletedCount) {
    var log = getRetentionLog();
    log.push({ date: new Date().toISOString(), type: type, deleted: deletedCount });
    return writeJson(RETENTION_LOG_KEY, log);
  }

  function makeButton(text, className, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderRetentionBar(quotes) {
    var bar = document.getElementById("retention-bar");
    var expired = quotes.filter(isPastRetention);
    bar.innerHTML = "";
    bar.hidden = false;

    var textWrap = document.createElement("div");
    var text = document.createElement("p");
    text.textContent = expired.length
      ? expired.length +
        (expired.length === 1 ? " quote has" : " quotes have") +
        " not been updated in over " +
        QUOTE_RETENTION_DAYS +
        " days and not marked as led to work. Mark any that led to work, then delete the rest."
      : "No quotes in this browser are past the " + QUOTE_RETENTION_DAYS + "-day retention period.";
    textWrap.appendChild(text);

    var log = getRetentionLog();
    var lastCleanUp = log
      .filter(function (e) {
        return e.type === "monthly-clean-up";
      })
      .pop();
    var lastPurge = log
      .filter(function (e) {
        return e.type === "quote-purge";
      })
      .pop();
    var logText = document.createElement("p");
    logText.className = "retention-log";
    logText.textContent =
      "Last monthly clean-up recorded in this browser: " +
      (lastCleanUp ? formatDate(lastCleanUp.date) : "none") +
      ". Last quote purge: " +
      (lastPurge ? formatDate(lastPurge.date) + " (" + lastPurge.deleted + " deleted)" : "none") +
      ".";
    textWrap.appendChild(logText);
    bar.appendChild(textWrap);

    var actions = document.createElement("div");
    actions.className = "admin-inline-actions";
    if (expired.length) {
      actions.appendChild(
        makeButton("Delete Quotes Past Retention", "btn btn-outline-dark", function () {
          confirmAction(
            "Delete quotes past retention?",
            "Delete " +
              expired.length +
              (expired.length === 1 ? " quote" : " quotes") +
              " not updated in over " +
              QUOTE_RETENTION_DAYS +
              " days? Quotes marked as led to work are kept. This can't be undone.",
            "Delete " + expired.length + (expired.length === 1 ? " quote" : " quotes"),
          ).then(function (ok) {
            if (!ok) return;
            var ids = getQuotes()
              .filter(isPastRetention)
              .map(function (q) {
                return q.id;
              });
            var saved = saveQuotes(
              getQuotes().filter(function (q) {
                return ids.indexOf(q.id) === -1;
              }),
            );
            if (!saved) return alertError(STORAGE_ERROR);
            addRetentionLogEntry("quote-purge", ids.length);
            toast(ids.length + (ids.length === 1 ? " quote" : " quotes") + " deleted.");
            renderDashboard();
          });
        }),
      );
    }
    actions.appendChild(
      makeButton("Record Monthly Clean-Up", "btn btn-outline-dark", function () {
        confirmAction(
          "Record the monthly clean-up?",
          "Only record today's date once you have deleted, everywhere they are kept (email, voicemail and texts, the form " +
            "service if one is used, and quotes in every browser that holds them), enquiries that didn't lead to work " +
            "and are about a month old.",
          "Record clean-up",
          "primary",
        ).then(function (ok) {
          if (!ok) return;
          if (!addRetentionLogEntry("monthly-clean-up", null)) return alertError(STORAGE_ERROR);
          toast("Monthly clean-up recorded.");
          renderDashboard();
        });
      }),
    );
    bar.appendChild(actions);
  }

  function getPublishedPriceDrift() {
    var prices = Pricing.getPrices();
    return Object.keys(Pricing.DEFAULT_PRICES)
      .filter(function (key) {
        return (
          Pricing.UNPUBLISHED_PRICE_KEYS.indexOf(key) === -1 &&
          Number(prices[key]) !== Number(Pricing.DEFAULT_PRICES[key])
        );
      })
      .map(function (key) {
        return { label: Pricing.PRICE_LABELS[key] || key, saved: prices[key], published: Pricing.DEFAULT_PRICES[key] };
      });
  }

  function buildPriceDriftNotice() {
    var drift = getPublishedPriceDrift();
    if (!drift.length) return null;
    var box = document.createElement("div");
    box.className = "admin-warning";
    var p = document.createElement("p");
    p.textContent =
      "These Business Prices differ from the prices on the public website, so quotes won't match what the website advertises. " +
      "Set them back, or ask your web developer to update the website prices.";
    box.appendChild(p);
    var ul = document.createElement("ul");
    drift.forEach(function (d) {
      var li = document.createElement("li");
      li.textContent = d.label + ": " + money(d.saved) + " here, " + money(d.published) + " on the website";
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  function renderDraftBanner() {
    var banner = document.getElementById("draft-banner");
    var stored = readDraft();
    if (!hasUnsavedDraft(stored)) {
      banner.hidden = true;
      return;
    }
    document.getElementById("draft-banner-text").textContent =
      "You have unsaved changes to " + describeDraft(stored) + ".";
    banner.hidden = false;
  }

  // Search by address, customer name, email or phone (digits match however
  // the number was typed).
  function matchesFilter(quote, filter) {
    var c = cleanCustomer(quote.customer);
    var text = [quote.address, c.name, c.email, c.phone].join(" ").toLowerCase();
    if (text.indexOf(filter) !== -1) return true;
    var digits = filter.replace(/\D/g, "");
    return digits.length >= 3 && c.phone.replace(/\D/g, "").indexOf(digits) !== -1;
  }

  function renderDashboard() {
    var all = getQuotes()
      .slice()
      .sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
    renderRetentionBar(all);
    renderDraftBanner();

    var driftSlot = document.getElementById("price-drift-notice");
    driftSlot.innerHTML = "";
    var driftNotice = buildPriceDriftNotice();
    driftSlot.hidden = !driftNotice;
    if (driftNotice) driftSlot.appendChild(driftNotice);

    var filter = document.getElementById("quote-filter").value.trim().toLowerCase();
    var quotes = filter
      ? all.filter(function (q) {
          return matchesFilter(q, filter);
        })
      : all;

    var list = document.getElementById("quote-list");
    var empty = document.getElementById("quote-list-empty");
    var count = document.getElementById("quote-count");
    list.innerHTML = "";
    empty.hidden = all.length > 0;
    count.textContent = !all.length
      ? ""
      : filter
        ? quotes.length + " of " + all.length + " quotes match “" + filter + "”."
        : all.length + (all.length === 1 ? " quote" : " quotes") + " saved in this browser.";

    quotes.forEach(function (quote) {
      var bathroom = (quote.data && quote.data.bathroom) || {};
      var legacy = Pricing.isLegacyQuoteData(bathroom);

      var card = document.createElement("article");
      card.className = "quote-card";
      card.setAttribute("data-quote-id", quote.id);

      var main = document.createElement("div");
      main.className = "quote-card-main";
      var h2 = document.createElement("h2");
      h2.textContent = quote.address;
      main.appendChild(h2);
      var who = customerSummary(quote.customer);
      if (who) main.appendChild(el("p", "quote-card-customer", who));

      var meta = document.createElement("p");
      meta.className = "quote-card-meta";
      meta.textContent =
        (quote.createdAt ? "Created " + formatDate(quote.createdAt) + " · " : "") +
        "Updated " +
        formatDate(quote.updatedAt);
      main.appendChild(meta);

      var chips = document.createElement("div");
      chips.className = "quote-chips";
      function chip(text, extra) {
        var c = document.createElement("span");
        c.className = "quote-chip" + (extra ? " " + extra : "");
        c.textContent = text;
        chips.appendChild(c);
      }
      chip("Bathroom");
      if (Number(bathroom.totalPrice) > 0 || !legacy) chip("Total " + money(bathroom.totalPrice), "quote-price-chip");
      if (legacy) chip("Needs review: old calculator", "quote-attention-chip");
      if (quote.ledToWork === true) chip("Led to work", "quote-won-chip");
      if (isPastRetention(quote)) chip("Past retention period", "quote-attention-chip");
      main.appendChild(chips);

      var actions = document.createElement("div");
      actions.className = "quote-card-actions";
      actions.appendChild(
        makeButton(legacy ? "Review / Edit" : "View / Edit", "", function () {
          openQuoteForEdit(quote.id);
        }),
      );
      var pdfBtn = makeButton("Download PDF", "", function () {
        downloadQuotePdf(quote, pdfBtn);
      });
      if (legacy) {
        pdfBtn.disabled = true;
        pdfBtn.title = "Review and save this quote first";
      }
      actions.appendChild(pdfBtn);
      actions.appendChild(
        makeButton(quote.ledToWork === true ? "Unmark Led to Work" : "Mark as Led to Work", "", function () {
          setLedToWork(quote.id, quote.ledToWork !== true);
        }),
      );
      var deleteBtn = makeButton("Delete", "danger", function () {
        confirmAction(
          "Delete this quote?",
          "Delete the quote for " + quote.address + "? This can't be undone.",
          "Delete quote",
        ).then(function (ok) {
          if (!ok) return;
          var saved = saveQuotes(
            getQuotes().filter(function (q) {
              return q.id !== quote.id;
            }),
          );
          if (!saved) return alertError(STORAGE_ERROR);
          toast("Quote for " + quote.address + " deleted.");
          renderDashboard();
          document.getElementById("quote-filter").focus();
        });
      });
      deleteBtn.setAttribute("aria-label", "Delete the quote for " + quote.address);
      actions.appendChild(deleteBtn);
      card.appendChild(main);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function setLedToWork(id, value) {
    var now = new Date().toISOString();
    var quotes = getQuotes().map(function (q) {
      if (q.id !== id) return q;
      var updated = Object.assign({}, q, { ledToWork: value, statusChangedAt: now });
      if (!value) delete updated.ledToWork;
      return updated;
    });
    if (!saveQuotes(quotes)) return alertError(STORAGE_ERROR);
    var quote = quotes.filter(function (q) {
      return q.id === id;
    })[0];
    toast(
      value
        ? "Quote for " + quote.address + " marked as led to work. It is kept as a customer record."
        : "Quote for " + quote.address + " is no longer marked as led to work.",
    );
    renderDashboard();
    var again = document.querySelector(
      '.quote-card[data-quote-id="' + id + '"] .quote-card-actions button:nth-child(3)',
    );
    if (again) again.focus();
  }

  // Opening a quote never silently replaces unsaved changes to another one.
  function openQuoteForEdit(id) {
    var quote = getQuotes().filter(function (q) {
      return q.id === id;
    })[0];
    if (!quote) return;
    var stored = readDraft();
    if (hasUnsavedDraft(stored) && stored.id === id) {
      // Unsaved changes to this same quote: carry on with them.
      draft = stored;
      return navigate("details");
    }
    var ask = hasUnsavedDraft(stored)
      ? askUnsavedDraft(
          stored,
          "Discard them and open the quote for " + quote.address + ", or resume them?",
          "Discard and open",
        )
      : Promise.resolve("discard");
    ask.then(function (choice) {
      if (choice === "resume") {
        draft = stored;
        navigate("details");
      } else if (choice === "discard") {
        draft = draftFromQuote(quote);
        persistDraft();
        navigate("details");
      }
    });
  }

  // Resume / discard / cancel for unsaved changes to another quote.
  function askUnsavedDraft(stored, message, discardLabel) {
    return askDialog({
      title: "You have unsaved changes",
      message: "Your changes to " + describeDraft(stored) + " haven't been saved. " + message,
      actions: [
        { id: "resume", label: "Resume changes", style: "primary" },
        { id: "discard", label: discardLabel, style: "danger" },
      ],
    });
  }

  // ------------------------------------------------------------------
  // Export / import (JSON) so quotes can leave this browser
  // ------------------------------------------------------------------
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportQuotes() {
    var quotes = getQuotes();
    if (!quotes.length) return toast("There are no quotes to export.");
    var payload = {
      app: "premium-restoration-quotes",
      version: 1,
      exportedAt: new Date().toISOString(),
      quotes: quotes,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      "premium-restoration-quotes-" + new Date().toISOString().slice(0, 10) + ".json",
    );
    toast("Exported " + quotes.length + (quotes.length === 1 ? " quote." : " quotes."));
  }

  // When a quote last changed: an edit, or marking it as led to work.
  function lastChanged(q) {
    return Math.max(new Date(q.updatedAt).getTime() || 0, new Date(q.statusChangedAt).getTime() || 0);
  }

  function importQuotes(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try {
        var parsed = JSON.parse(reader.result);
        incoming = Array.isArray(parsed) ? parsed : parsed && parsed.quotes;
        if (!Array.isArray(incoming)) throw new Error("no quotes");
        incoming = incoming.filter(function (q) {
          return q && typeof q.id === "string" && typeof q.address === "string" && q.data;
        });
      } catch (e) {
        return alertError("That file isn't a quotes export from this tool, so nothing was imported.");
      }
      if (!incoming.length) return alertError("That file has no quotes in it, so nothing was imported.");
      var quotes = getQuotes();
      var byId = {};
      quotes.forEach(function (q, i) {
        byId[q.id] = i;
      });
      var added = 0;
      var updated = 0;
      incoming.forEach(function (q) {
        if (byId[q.id] === undefined) {
          quotes.push(q);
          added++;
        } else if (lastChanged(q) > lastChanged(quotes[byId[q.id]])) {
          quotes[byId[q.id]] = q;
          updated++;
        }
      });
      if (!added && !updated) {
        return toast("Nothing new to import: every quote in that file is already here and up to date.");
      }
      confirmAction(
        "Import quotes?",
        "Import " + added + " new quote(s) and update " + updated + " with newer copies from this file?",
        "Import quotes",
        "primary",
      ).then(function (ok) {
        if (!ok) return;
        if (!saveQuotes(quotes)) return alertError(STORAGE_ERROR);
        toast("Imported " + added + " new and " + updated + " updated quote(s).");
        renderDashboard();
      });
    };
    reader.onerror = function () {
      alertError("That file couldn't be read, so nothing was imported.");
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------------
  // Customer-ready PDF of a saved quote (same style as the public estimate)
  // ------------------------------------------------------------------
  function downloadQuotePdf(quote, button) {
    var bathroom = quote.data.bathroom;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    Promise.all([window.EstimatePdf.load(), configReady])
      .then(function (loaded) {
        var config = loaded[1];
        var values = bathroom.jobValues || {};
        var scope = bathroom.scope || {};
        var prices = Object.assign({}, Pricing.DEFAULT_PRICES, bathroom.prices || {});
        var result = Pricing.computeEstimate(values, scope, { prices: prices, includeTrade: true });
        var totals = [{ label: "Labor subtotal", value: money(result.subtotal) }];
        if (result.taxRatePercent > 0) {
          totals.push({ label: "Tax (" + result.taxRatePercent + "%)", value: money(result.taxAmount) });
        }
        totals.push({ label: "Estimated Labor Total", value: money(result.total), strong: true });
        var doc = window.EstimatePdf.build({
          title: "Bathroom Restoration — Labor Estimate",
          preparedFor: [cleanCustomer(quote.customer).name, quote.address].filter(Boolean).join(", "),
          intro: "Labor estimate for the work listed below.",
          lines: result.lines.map(function (l) {
            return { label: l.label, detail: l.detail, amount: money(l.cost) };
          }),
          excluded: [
            {
              label: "Materials, permits" + (result.taxRatePercent > 0 ? "" : " & any applicable taxes"),
              value: "Not included",
            },
          ],
          totals: totals,
          afterTotal: [
            "This is an estimate of labor only, for the work listed. It is not a contract. Materials and permits are not included" +
              (result.taxRatePercent > 0 ? "" : ", and neither are any applicable taxes") +
              ". Prices are current as of the date generated and may change. Your actual price is set only in a written agreement with us.",
            "We do not currently hold a contractor licence. Before any work is agreed, we will tell you who will do any plumbing and electrical work, how it will be priced, and whether your job needs any permits.",
          ],
          sections: [
            { title: "What this estimate assumes", items: Pricing.estimateAssumptions(values, scope, result) },
          ],
          footer: {
            business: Business.businessLine(config && config.owner.legalName),
            phone: Business.PHONE,
            email: Business.EMAIL,
            date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          },
        });
        doc.save(
          "estimate-" +
            quote.address
              .replace(/[^a-z0-9]+/gi, "-")
              .replace(/^-|-$/g, "")
              .toLowerCase() +
            ".pdf",
        );
      })
      .catch(function () {
        alertError("The PDF couldn't be prepared. Check your connection and try again.");
      })
      .then(function () {
        button.disabled = false;
        button.textContent = label;
      });
  }

  // ------------------------------------------------------------------
  // Property and customer (top of the quote screen)
  // ------------------------------------------------------------------
  var CUSTOMER_FIELDS = { name: "quote-customer-name", phone: "quote-customer-phone", email: "quote-customer-email" };

  function renderQuoteHeader() {
    document.getElementById("quote-eyebrow").textContent = draft.isNew ? "New Quote" : "Editing Quote";
    document.getElementById("quote-address").value = draft.address || "";
    var customer = cleanCustomer(draft.customer);
    Object.keys(CUSTOMER_FIELDS).forEach(function (key) {
      document.getElementById(CUSTOMER_FIELDS[key]).value = customer[key];
    });
    ["quote-address", "quote-customer-phone", "quote-customer-email"].forEach(function (id) {
      setInputError(id, null);
    });
  }

  function setInputError(id, message) {
    var input = document.getElementById(id);
    var error = document.getElementById(id + "-error");
    if (message) error.textContent = message;
    error.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    input.closest(".form-group").classList.toggle("has-error", !!message);
  }

  // Address is required; the customer's details are optional but must look
  // right if given. Returns the id of the first field with a problem.
  function validateQuoteHeader() {
    var problems = {};
    if (!String(draft.address || "").trim()) problems["quote-address"] = "Enter the property address.";
    var c = cleanCustomer(draft.customer);
    var digits = c.phone.replace(/\D/g, "");
    if (c.phone && (!/^[0-9+().\-\s]+$/.test(c.phone) || digits.length < 10 || digits.length > 15)) {
      problems["quote-customer-phone"] = "Enter a phone number with 10 to 15 digits, or leave it blank.";
    }
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) {
      problems["quote-customer-email"] = "Enter an email address like name@example.com, or leave it blank.";
    }
    var first = null;
    ["quote-address", "quote-customer-phone", "quote-customer-email"].forEach(function (id) {
      setInputError(id, problems[id] || null);
      if (problems[id] && !first) first = id;
    });
    return first;
  }

  // ------------------------------------------------------------------
  // The bathroom calculator. Every row shows its own cost in one
  // right-hand column; the numbers all come from Pricing.computeEstimate.
  // ------------------------------------------------------------------
  var calc = null; // { costCells: [{ el, keys }], errorEls: {}, recompute }

  function jobValueWarning(laborSubtotal) {
    var cap = JOB_VALUE_CHECKPOINTS.exemptionCap;
    var affirmation = JOB_VALUE_CHECKPOINTS.affirmation;
    if (laborSubtotal >= cap) {
      return (
        "Labor alone is " +
        money(laborSubtotal) +
        ", at or above " +
        money(cap) +
        ". Utah's small-project exemption from contractor licensing (if Utah law applies) only covers jobs under " +
        money(cap) +
        " including materials. Get legal advice before quoting this job."
      );
    }
    if (laborSubtotal >= affirmation) {
      return (
        "Labor alone is " +
        money(laborSubtotal) +
        ", at or above " +
        money(affirmation) +
        ", before materials. Above " +
        money(affirmation) +
        " (labor plus materials), Utah's small-project exemption needs an insurance affirmation filed, and it ends at " +
        money(cap) +
        ". Get legal advice before quoting this job."
      );
    }
    return (
      "Labor only. Add the cost of materials before comparing this job with the " +
      money(affirmation) +
      " and " +
      money(cap) +
      " licensing thresholds."
    );
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  var uid = 0;

  function calcRow(labelText, control, costKeys, hint) {
    var row = el("div", "calc-row");
    var labelWrap = el("div", "calc-label");
    var id = "calc-" + ++uid;
    var label = el(control.isGroup ? "p" : "label", "calc-label-text", labelText);
    label.id = id + "-label";
    if (!control.isGroup) label.htmlFor = id;
    labelWrap.appendChild(label);
    if (hint) labelWrap.appendChild(el("span", "calc-hint", hint));
    row.appendChild(labelWrap);

    var controlWrap = el("div", "calc-control");
    if (control.isGroup) control.node.setAttribute("aria-labelledby", label.id);
    else control.node.id = id;
    controlWrap.appendChild(control.node);
    var error = el("p", "calc-error");
    error.hidden = true;
    error.id = id + "-error";
    control.node.setAttribute("aria-describedby", error.id);
    controlWrap.appendChild(error);
    row.appendChild(controlWrap);

    var cost = el("div", "calc-cost");
    cost.setAttribute("aria-live", "off");
    row.appendChild(cost);
    if (costKeys) calc.costCells.push({ el: cost, keys: costKeys });
    else cost.classList.add("is-empty");
    return { row: row, error: error };
  }

  function numberInput(key, inputmode) {
    var input = el("input", "calc-input");
    input.type = "text";
    input.inputMode = inputmode || "numeric";
    input.autocomplete = "off";
    input.placeholder = "0";
    input.name = key;
    input.value = draft.values[key] !== undefined ? draft.values[key] : "";
    input.addEventListener("input", function () {
      draft.values[key] = input.value.trim();
      if (draft.values[key] === "") delete draft.values[key];
      onChange(key);
    });
    return { node: input };
  }

  function choiceGroup(question) {
    var group = el("div", "calc-choices");
    group.setAttribute("role", "radiogroup");
    var name = "scope-" + question.key;
    question.options.forEach(function (option, i) {
      var label = el("label", "calc-choice");
      var input = el("input");
      input.type = "radio";
      input.name = name;
      input.value = String(i);
      input.checked = draft.scope[question.key] === option.value;
      input.addEventListener("change", function () {
        draft.scope[question.key] = option.value;
        onChange(question.key);
      });
      label.appendChild(input);
      label.appendChild(el("span", null, option.label));
      group.appendChild(label);
    });
    return { node: group, isGroup: true };
  }

  function checkbox(key, text) {
    var label = el("label", "calc-check");
    var input = el("input");
    input.type = "checkbox";
    input.checked = draft.values[key] === true;
    input.addEventListener("change", function () {
      if (input.checked) draft.values[key] = true;
      else delete draft.values[key];
      onChange(key);
    });
    label.appendChild(input);
    label.appendChild(el("span", null, text));
    return { node: label, isGroup: true };
  }

  function section(title, note) {
    var wrap = el("section", "calc-section");
    wrap.appendChild(el("h2", "calc-section-title", title));
    if (note) wrap.appendChild(el("p", "admin-warning-inline", note));
    return wrap;
  }

  function onChange(key) {
    if (calc.errorEls[key]) setFieldError(key, null);
    persistDraft();
    calc.recompute();
  }

  function setFieldError(key, message) {
    var e = calc.errorEls[key];
    if (!e) return;
    e.error.textContent = message || "";
    e.error.hidden = !message;
    e.row.classList.toggle("has-error", !!message);
    var input = e.row.querySelector(".calc-input");
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function renderEditor() {
    var prices = Pricing.getPrices();
    calc = { costCells: [], errorEls: {}, recompute: null };
    renderQuoteHeader();
    document.getElementById("quote-error").hidden = true;
    var saveBtn = document.getElementById("save-quote-btn");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Quote";

    var container = document.getElementById("quote-sections");
    container.innerHTML = "";
    var root = el("div", "bathroom-calculator");

    if (draft.legacy) {
      var legacyBox = el("div", "admin-warning");
      legacyBox.setAttribute("data-testid", "legacy-notice");
      var text =
        "This quote was saved with the old calculator, which charged demolition, tile, flooring and painting for every room" +
        (draft.legacy.total ? " (it came to " + money(draft.legacy.total) + ")" : "") +
        ". The work it included wasn't recorded, so choose the work below. The saved total only changes when you save.";
      if (!draft.legacy.hadDimensions && (draft.legacy.floorSqFt || draft.legacy.wallSqFt)) {
        text +=
          " It had no room dimensions — only " +
          Pricing.formatQty(draft.legacy.floorSqFt) +
          " sq ft of floor and " +
          Pricing.formatQty(draft.legacy.wallSqFt) +
          " sq ft of wall — so enter the width, length and height.";
      }
      legacyBox.appendChild(el("p", null, text));
      root.appendChild(legacyBox);
    }

    var drift = buildPriceDriftNotice();
    if (drift) root.appendChild(drift);

    // Room size
    var dims = section("Room size");
    dims.appendChild(
      el(
        "p",
        "calc-help",
        "Only needed for work priced by area (demolition, floor, walls, ceiling). Feet (5.5) or feet and inches (5' 6\") both work. Floor area = width × length; wall area = 2 × height × (width + length).",
      ),
    );
    var dimGrid = el("div", "calc-dims");
    Pricing.DIMENSIONS.forEach(function (d) {
      var field = el("div", "calc-dim");
      var id = "calc-" + ++uid;
      var label = el("label", "calc-label-text", d.label + " (ft)");
      label.htmlFor = id;
      var input = numberInput(d.key, "text").node;
      input.id = id;
      input.placeholder = "e.g. 5' 6\"";
      var error = el("p", "calc-error");
      error.hidden = true;
      error.id = id + "-error";
      input.setAttribute("aria-describedby", error.id);
      field.appendChild(label);
      field.appendChild(input);
      field.appendChild(error);
      dimGrid.appendChild(field);
      calc.errorEls[d.key] = { row: field, error: error };
    });
    dims.appendChild(dimGrid);
    var areaText = el("p", "calc-areas");
    areaText.setAttribute("aria-live", "polite");
    dims.appendChild(areaText);
    root.appendChild(dims);

    // Work
    var work = section("Work");
    var workCosts = {
      demolition: ["demolition"],
      floorFinish: ["floorTile", "flooring"],
      walls: ["wallTile", "wallPaint"],
      paintCeiling: ["ceilingPaint"],
    };
    Pricing.SCOPE_QUESTIONS.forEach(function (q) {
      var r = calcRow(q.label, choiceGroup(q), workCosts[q.key]);
      calc.errorEls[q.key] = r;
      work.appendChild(r.row);
    });
    root.appendChild(work);

    // Fixtures
    var fixtures = section("Fixtures", LICENCE_NOTES.Fixtures);
    Pricing.FIXTURES.forEach(function (f) {
      var r = calcRow(
        f.plural,
        numberInput(f.key),
        [f.key],
        Pricing.shortMoney(Pricing.fixtureRate(f, prices)) + " each",
      );
      calc.errorEls[f.key] = r;
      fixtures.appendChild(r.row);
    });
    root.appendChild(fixtures);

    // Plumbing
    var plumbing = section("Plumbing", LICENCE_NOTES.Plumbing);
    var pointsOut = el("output", "calc-readout");
    var pointsRow = calcRow(
      "Plumbing points",
      { node: pointsOut },
      ["plumbing"],
      "One per toilet, sink, shower and bathtub above — " +
        Pricing.shortMoney(prices.Plumbing_Price_Per_Point) +
        " each",
    );
    plumbing.appendChild(pointsRow.row);
    plumbing.appendChild(
      calcRow(
        "No existing plumbing stack",
        checkbox("No_Stack_Surcharge_Included", "Add surcharge"),
        ["noStack"],
        Pricing.shortMoney(prices.No_Stack_Surcharge_Price) + " flat",
      ).row,
    );
    plumbing.appendChild(
      calcRow(
        "Bad valve needs replacing",
        checkbox("Bad_Valve_Surcharge_Included", "Add surcharge"),
        ["badValve"],
        Pricing.shortMoney(prices.Bad_Valve_Surcharge_Price) + " flat",
      ).row,
    );
    root.appendChild(plumbing);

    // Electrical
    var electrical = section("Electrical", LICENCE_NOTES.Electrical);
    var er = calcRow(
      "Electrical points",
      numberInput("Electrical_Points"),
      ["electrical"],
      "Lamps, outlets, fans, switches, electric toilet — " +
        Pricing.shortMoney(prices.Electrical_Price_Per_Point) +
        " each",
    );
    calc.errorEls.Electrical_Points = er;
    electrical.appendChild(er.row);
    root.appendChild(electrical);

    // Totals
    var banner = el("div", "bathroom-total-banner");
    banner.setAttribute("aria-live", "polite");
    function totalLine(labelText, role, main) {
      var line = el("div", "bathroom-total-line" + (main ? " main" : ""));
      var label = el("span", "label", labelText);
      var value = el("span", "value", "$0.00");
      value.setAttribute("data-role", role);
      line.appendChild(label);
      line.appendChild(value);
      banner.appendChild(line);
      return { label: label, value: value };
    }
    var subtotalLine = totalLine("Subtotal", "subtotal");
    var taxLine = totalLine("Tax", "tax");
    var totalLineEls = totalLine("Total Bathroom Price", "price", true);
    root.appendChild(banner);
    var jobValueNote = el("p", "admin-warning-inline");
    root.appendChild(jobValueNote);

    calc.recompute = function () {
      var result = Pricing.computeEstimate(draft.values, draft.scope, { prices: prices, includeTrade: true });
      var byKey = {};
      result.lines.forEach(function (l) {
        byKey[l.key] = l;
      });
      calc.costCells.forEach(function (cell) {
        var line = null;
        cell.keys.forEach(function (k) {
          if (byKey[k]) line = byKey[k];
        });
        cell.el.innerHTML = "";
        if (line) {
          cell.el.appendChild(el("span", "calc-cost-value", money(line.cost)));
          cell.el.appendChild(el("span", "calc-cost-detail", line.detail));
          cell.el.classList.remove("is-zero");
        } else {
          cell.el.appendChild(el("span", "calc-cost-value", "—"));
          cell.el.classList.add("is-zero");
        }
      });
      pointsOut.textContent = Pricing.formatQty(result.plumbingFixtureCount);
      var needs = Pricing.scopeNeeds(draft.scope);
      areaText.textContent =
        "Floor / ceiling: " +
        Pricing.formatQty(result.floorSqFt) +
        " sq ft · Walls: " +
        Pricing.formatQty(result.wallSqFt) +
        " sq ft" +
        (needs.floorArea ? "" : " (not used by the work chosen so far)");
      subtotalLine.value.textContent = money(result.subtotal);
      taxLine.label.textContent = "Tax (" + result.taxRatePercent + "%)";
      taxLine.value.textContent = money(result.taxAmount);
      totalLineEls.value.textContent = money(result.total);
      jobValueNote.textContent = jobValueWarning(result.subtotal);
      return result;
    };

    container.appendChild(root);
    calc.recompute();
  }

  var saving = false;

  function handleQuoteSubmit(e) {
    e.preventDefault();
    if (saving || !draft) return;
    var errorBox = document.getElementById("quote-error");
    var firstHeaderProblem = validateQuoteHeader();
    var validation = Pricing.validateJob(draft.values, draft.scope, { includeTrade: true });
    Object.keys(calc.errorEls).forEach(function (key) {
      setFieldError(key, validation.errors[key] || null);
    });
    if (firstHeaderProblem || !validation.valid) {
      var count =
        Object.keys(validation.errors).length + document.querySelectorAll("#screen-quote .form-group.has-error").length;
      errorBox.textContent =
        "Fix the " + (count === 1 ? "highlighted answer" : count + " highlighted answers") + " before saving.";
      errorBox.hidden = false;
      if (firstHeaderProblem) {
        document.getElementById(firstHeaderProblem).focus();
        return;
      }
      var firstKey = Object.keys(calc.errorEls).filter(function (k) {
        return validation.errors[k];
      })[0];
      var first = firstKey && calc.errorEls[firstKey].row.querySelector("input");
      if (first) first.focus();
      return;
    }
    errorBox.hidden = true;

    saving = true;
    var saveBtn = document.getElementById("save-quote-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    var prices = Pricing.getPrices();
    var now = new Date().toISOString();
    // Measurements are stored in feet (5' 6" is saved as 5.5), and the total
    // is worked out from exactly what is stored, so the PDF always matches.
    var jobValues = {};
    VALUE_KEYS.forEach(function (key) {
      var v = draft.values[key];
      if (typeof v === "boolean") jobValues[key] = v;
      else if (DIMENSION_KEYS.indexOf(key) !== -1) jobValues[key] = Math.round((Pricing.parseFeet(v) || 0) * 1e4) / 1e4;
      else jobValues[key] = Pricing.parseNumber(v) || 0;
    });
    var result = Pricing.computeEstimate(jobValues, draft.scope, { prices: prices, includeTrade: true });
    var bathroom = {
      calcVersion: Pricing.CALC_VERSION,
      jobValues: jobValues,
      scope: Object.assign({}, draft.scope),
      prices: prices,
      lines: result.lines,
      subtotal: result.subtotal,
      taxRatePercent: result.taxRatePercent,
      taxAmount: result.taxAmount,
      totalPrice: result.total,
    };

    // Insert or update by the draft's id, so pressing Save twice can never
    // create two quotes.
    var quotes = getQuotes();
    var existing = quotes.filter(function (q) {
      return q.id === draft.id;
    })[0];
    var record = Object.assign({}, existing || {}, {
      id: draft.id,
      address: draft.address.trim(),
      customer: cleanCustomer(draft.customer),
      data: { bathroom: bathroom },
      createdAt: (existing && existing.createdAt) || draft.createdAt || now,
      updatedAt: now,
    });
    if (existing) {
      quotes = quotes.map(function (q) {
        return q.id === draft.id ? record : q;
      });
    } else {
      quotes.push(record);
    }

    var address = draft.address.trim();
    if (!saveQuotes(quotes)) {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Quote";
      errorBox.textContent =
        "Couldn't save this quote in this browser. " +
        STORAGE_ERROR.replace(/^Couldn't save in this browser — /, "The browser's storage is ");
      errorBox.hidden = false;
      alertError(STORAGE_ERROR);
      return;
    }
    clearDraft();
    saving = false;
    currentRoute = "dashboard";
    navigate("dashboard", { replace: true });
    toast("Quote for " + address + " saved.");
  }

  // ------------------------------------------------------------------
  // Business prices
  // ------------------------------------------------------------------
  var RATE_SECTIONS = [
    { title: "Preparation", keys: ["Demo_Price_Per_SqFt"] },
    {
      title: "Fixtures",
      note: "The bathtub price isn't set here — it's always 30% less than the shower price.",
      keys: [
        "Toilet_Price",
        "Sink_Price",
        "Shower_Price",
        "Shower_Door_Price",
        "Door_Price",
        "Vanity_Price",
        "Cabinet_Price",
        "Mirror_Price",
        "Mirror_Huge_Price",
        "Shower_Shelf_Price",
      ],
    },
    {
      title: "Surfaces",
      note: "Tile is charged on the floor and/or walls you choose to tile; painting on the walls and/or ceiling you choose to paint; flooring on the floor area.",
      keys: ["Tile_Price_Per_SqFt", "Floor_Price_Per_SqFt", "Painting_Price_Per_SqFt"],
    },
    {
      title: "Plumbing",
      note: "Plumbing points are counted automatically from the toilets, sinks, showers and bathtubs on the quote.",
      keys: ["Plumbing_Price_Per_Point", "No_Stack_Surcharge_Price", "Bad_Valve_Surcharge_Price"],
    },
    { title: "Electrical", keys: ["Electrical_Price_Per_Point"] },
    {
      title: "Tax",
      note: "Leave at 0 unless a tax adviser has confirmed that tax applies to this labor. Any rate set here is added to every bathroom quote.",
      keys: ["Labor_Tax_Rate_Percent"],
    },
  ];

  // What the price fields held when the screen opened, to know whether
  // leaving would throw edits away.
  var ratesBaseline = null;

  function ratesSnapshot() {
    return JSON.stringify(
      Array.prototype.map.call(document.querySelectorAll("#rates-form input[name]"), function (input) {
        return [input.name, input.value.trim()];
      }),
    );
  }

  function ratesDirty() {
    return ratesBaseline !== null && ratesSnapshot() !== ratesBaseline;
  }

  function confirmDiscardPrices() {
    return confirmAction(
      "Discard price changes?",
      "Your changes to Business Prices haven't been saved.",
      "Discard changes",
    );
  }

  function leavePrices() {
    (ratesDirty() ? confirmDiscardPrices() : Promise.resolve(true)).then(function (discard) {
      if (!discard) return;
      ratesBaseline = null;
      navigate("dashboard");
    });
  }

  function renderRatesForm() {
    var prices = Pricing.getPrices();
    var container = document.getElementById("rates-sections");
    container.innerHTML = "";
    RATE_SECTIONS.forEach(function (s) {
      var group = el("section", "rate-group");
      group.appendChild(el("h2", "rate-group-title", s.title));
      if (s.note) group.appendChild(el("p", "rate-group-subtitle", s.note));
      s.keys.forEach(function (key) {
        var isPercent = key === "Labor_Tax_Rate_Percent";
        var row = el("div", "rate-row");
        var id = "rate-" + key;
        var label = el("label", "rate-row-label", Pricing.PRICE_LABELS[key]);
        label.htmlFor = id;
        row.appendChild(label);
        var control = el("div", "rate-row-control");
        if (!isPercent) control.appendChild(el("span", "rate-row-prefix", "$"));
        var input = el("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.id = id;
        input.name = key;
        input.value = prices[key];
        control.appendChild(input);
        if (isPercent) control.appendChild(el("span", "rate-row-prefix", "%"));
        row.appendChild(control);
        group.appendChild(row);
      });
      container.appendChild(group);
    });
    ratesBaseline = ratesSnapshot();
  }

  function handleRatesSubmit(e) {
    e.preventDefault();
    var prices = Pricing.getPrices();
    var bad = [];
    Object.keys(Pricing.DEFAULT_PRICES).forEach(function (key) {
      var input = document.querySelector('#rates-form [name="' + key + '"]');
      if (!input) return;
      var n = Pricing.parseNumber(input.value);
      var invalid = n === null || isNaN(n) || n < 0 || (key === "Labor_Tax_Rate_Percent" && n > 100);
      input.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid) bad.push(input);
      else prices[key] = n;
    });
    if (bad.length) {
      alertError("Some prices aren't valid numbers (0 or more). Fix the highlighted fields and save again.");
      bad[0].focus();
      return;
    }
    if (!writeJson(Pricing.RATES_KEY, { prices: prices })) return alertError(STORAGE_ERROR);
    ratesBaseline = null;
    toast("Business prices saved.", "dashboard");
    navigate("dashboard");
  }

  // ------------------------------------------------------------------
  // Wire up
  // ------------------------------------------------------------------
  function startNewQuote() {
    var stored = readDraft();
    var ask = hasUnsavedDraft(stored)
      ? askUnsavedDraft(stored, "Discard them and start a new quote, or resume them?", "Discard and start new")
      : Promise.resolve("discard");
    ask.then(function (choice) {
      if (choice === "resume") {
        draft = stored;
        navigate("details");
      } else if (choice === "discard") {
        draft = newDraft();
        persistDraft();
        navigate("details");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Restore an unsaved quote (e.g. after a reload).
    var stored = readDraft();
    if (stored && stored.id) draft = stored;

    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("login-password");
      var error = document.getElementById("login-error");
      if (input.value === ADMIN_PASSWORD) {
        setAuthed(true);
        error.hidden = true;
        input.value = "";
        render(routeFromHash());
      } else {
        error.hidden = false;
      }
    });
    document.getElementById("logout-btn").addEventListener("click", function () {
      setAuthed(false);
      render("dashboard");
    });
    document.getElementById("create-quote-btn").addEventListener("click", startNewQuote);
    document.getElementById("open-rates-btn").addEventListener("click", function () {
      navigate("prices");
    });
    document.getElementById("export-quotes-btn").addEventListener("click", exportQuotes);
    document.getElementById("import-quotes-input").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) importQuotes(file);
      e.target.value = "";
    });
    document.getElementById("quote-filter").addEventListener("input", renderDashboard);
    document.getElementById("draft-resume-btn").addEventListener("click", function () {
      draft = readDraft();
      if (draft) navigate("details");
    });
    document.getElementById("draft-discard-btn").addEventListener("click", function () {
      var stored = readDraft();
      confirmDiscardQuote(stored).then(function (discard) {
        if (!discard) return;
        clearDraft();
        renderDashboard();
        document.getElementById("create-quote-btn").focus();
      });
    });
    document.getElementById("admin-toast-close").addEventListener("click", hideToast);
    document.getElementById("rates-form").addEventListener("submit", handleRatesSubmit);
    document.getElementById("quote-address").addEventListener("input", function (e) {
      if (!draft) return;
      draft.address = e.target.value;
      setInputError("quote-address", null);
      persistDraft();
    });
    Object.keys(CUSTOMER_FIELDS).forEach(function (key) {
      var input = document.getElementById(CUSTOMER_FIELDS[key]);
      input.addEventListener("input", function () {
        if (!draft) return;
        draft.customer = cleanCustomer(draft.customer);
        draft.customer[key] = input.value;
        if (key !== "name") setInputError(CUSTOMER_FIELDS[key], null);
        persistDraft();
      });
    });
    document.getElementById("quote-form").addEventListener("submit", handleQuoteSubmit);
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="cancel-quote"]'), function (btn) {
      btn.addEventListener("click", cancelQuote);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="leave-prices"]'), function (btn) {
      btn.addEventListener("click", leavePrices);
    });
    window.addEventListener("hashchange", function () {
      render(routeFromHash());
    });

    var route = routeFromHash();
    if (draft && (route === "new" || route === "details") && isAuthed() && hasUnsavedDraft(draft)) {
      toast("Restored your unsaved changes to " + describeDraft(draft) + ".", "details");
    }
    render(route);
  });
})();
