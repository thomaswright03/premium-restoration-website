// Premium Restoration admin tool — Log-in, screens and their addresses (#/dashboard, #/details, #/prices),
// and wiring everything up once the page and site-config.json have loaded.
//
// SECURITY NOTE: the password gate is client-side only (there is no
// backend). Anyone who reads this file can find the password and skip the
// login. It only deters casual access — it is not real authentication.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  var ADMIN_PASSWORD = "templein26)";

  // "new" is the old address of the first quote step; it now opens the one quote screen.
  var ROUTES = { dashboard: "screen-dashboard", details: "screen-quote", new: "screen-quote", prices: "screen-rates" };

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
  function isAuthed() {
    try {
      return sessionStorage.getItem(A.AUTH_KEY) === "true";
    } catch (e) {
      return window.__prAuthed === true;
    }
  }

  function setAuthed(value) {
    try {
      if (value) sessionStorage.setItem(A.AUTH_KEY, "true");
      else sessionStorage.removeItem(A.AUTH_KEY);
    } catch (e) {
      window.__prAuthed = value;
    }
  }

  // ------------------------------------------------------------------
  // Routing
  // ------------------------------------------------------------------
  A.state.currentRoute = null;

  function routeFromHash() {
    var m = /^#\/(\w+)/.exec(window.location.hash || "");
    return m && ROUTES[m[1]] ? m[1] : "dashboard";
  }

  function showScreen(id) {
    Array.prototype.forEach.call(document.querySelectorAll(".admin-screen"), function (el) {
      el.hidden = el.id !== id;
    });
    window.scrollTo(0, 0);
    var h1 = /** @type {HTMLElement | null} */ (document.querySelector("#" + id + " h1"));
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
      A.state.currentRoute = null;
      return;
    }
    if (route === "new") {
      route = "details";
      history.replaceState(null, "", "#/details");
    }
    // Leaving the quote or the prices with unsaved changes (e.g. the
    // browser's Back button) asks first; until then, stay where we are.
    var leavingEditor = A.state.currentRoute === "details" && route !== "details";
    var leavingPrices = A.state.currentRoute === "prices" && route !== "prices";
    if ((leavingEditor && A.state.draft && A.isDirty()) || (leavingPrices && A.ratesDirty())) {
      var from = A.state.currentRoute;
      history.replaceState(null, "", "#/" + from);
      (leavingEditor ? A.confirmDiscardQuote(A.state.draft) : A.confirmDiscardPrices()).then(function (discard) {
        if (!discard || A.state.currentRoute !== from) return;
        if (leavingEditor) A.clearDraft();
        A.state.ratesBaseline = null;
        A.state.currentRoute = null;
        navigate(route);
      });
      return;
    }
    if (leavingEditor) A.clearDraft();
    if (leavingPrices) A.state.ratesBaseline = null;

    if ((route === "details" || route === "prices") && !A.Pricing.hasPublishedPrices()) {
      route = "dashboard";
      history.replaceState(null, "", "#/dashboard");
    }
    if (route === "details" && !A.state.draft) {
      route = "dashboard";
      history.replaceState(null, "", "#/dashboard");
    }

    A.alertError(A.Pricing.hasPublishedPrices() ? "" : A.PRICES_MISSING);
    if (A.state.toastRoute && A.state.toastRoute !== route) A.hideToast();
    A.state.currentRoute = route;
    if (route === "dashboard" && !A.state.persistenceAsked) {
      // Once per visit, ask the browser to keep this tool's data.
      A.state.persistenceAsked = true;
      A.checkPersistence(true);
    }
    if (route === "dashboard") A.renderDashboard();
    if (route === "details") A.renderEditor();
    if (route === "prices") A.renderRatesForm();
    showScreen(ROUTES[route]);
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Reopen the quote this tab was editing (e.g. after a reload).
    A.migrateOldDraft();
    var stored = A.readDraft(A.tabDraftId());
    if (stored) A.state.draft = stored;

    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = /** @type {HTMLInputElement} */ (document.getElementById("login-password"));
      var error = document.getElementById("login-error");
      if (input.value === ADMIN_PASSWORD) {
        setAuthed(true);
        error.hidden = true;
        input.value = "";
        A.configReady.then(function () {
          render(routeFromHash());
        });
      } else {
        error.hidden = false;
      }
    });
    document.getElementById("logout-btn").addEventListener("click", function () {
      setAuthed(false);
      render("dashboard");
    });
    document.getElementById("create-quote-btn").addEventListener("click", A.startNewQuote);
    document.getElementById("open-rates-btn").addEventListener("click", function () {
      if (!A.pricesReady()) return;
      navigate("prices");
    });
    document.getElementById("export-quotes-btn").addEventListener("click", A.exportQuotes);
    A.initDisclosure("backup", A.renderBackupPanel);
    document.getElementById("empty-restore-btn").addEventListener("click", function () {
      document.getElementById("import-quotes-input").click();
    });
    A.initDisclosure("retention", A.renderRetentionBar);
    document.getElementById("import-quotes-input").addEventListener("change", function (e) {
      var picker = /** @type {HTMLInputElement} */ (e.target);
      var file = picker.files && picker.files[0];
      if (file) A.importQuotes(file);
      picker.value = "";
    });
    document.getElementById("quote-filter").addEventListener("input", A.renderDashboard);
    document.getElementById("persist-retry-btn").addEventListener("click", function () {
      A.checkPersistence(true).then(function (state) {
        A.toast(
          state === "persisted"
            ? "The browser has agreed to keep this tool's data."
            : "The browser still hasn't agreed to keep this tool's data, so keep exporting backups.",
        );
      });
    });
    // Another tab saved, deleted or backed up quotes: keep this dashboard current.
    window.addEventListener("storage", function (e) {
      if (A.state.currentRoute !== "dashboard" || !isAuthed()) return;
      if (!e.key || e.key === A.QUOTES_KEY || e.key === A.BACKUP_KEY || e.key.indexOf(A.DRAFT_PREFIX) === 0) {
        A.renderDashboard();
      }
    });
    document.getElementById("admin-toast-close").addEventListener("click", A.hideToast);
    document.getElementById("rates-form").addEventListener("submit", A.handleRatesSubmit);
    document.getElementById("quote-address").addEventListener("input", function (e) {
      if (!A.state.draft) return;
      A.state.draft.address = /** @type {HTMLInputElement} */ (e.target).value;
      A.setInputError("quote-address", null);
      A.refreshErrorSummary();
      A.persistDraft();
    });
    Object.keys(A.CUSTOMER_FIELDS).forEach(function (key) {
      var input = /** @type {HTMLInputElement} */ (document.getElementById(A.CUSTOMER_FIELDS[key]));
      input.addEventListener("input", function () {
        if (!A.state.draft) return;
        A.state.draft.customer = A.cleanCustomer(A.state.draft.customer);
        A.state.draft.customer[key] = input.value;
        if (key !== "name") A.setInputError(A.CUSTOMER_FIELDS[key], null);
        A.refreshErrorSummary();
        A.persistDraft();
      });
    });
    document.getElementById("quote-form").addEventListener("submit", A.handleQuoteSubmit);
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="cancel-quote"]'), function (btn) {
      btn.addEventListener("click", A.cancelQuote);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="leave-prices"]'), function (btn) {
      btn.addEventListener("click", A.leavePrices);
    });
    window.addEventListener("hashchange", function () {
      render(routeFromHash());
    });

    // The published prices arrive with site-config.json: render once it has loaded.
    A.configReady.then(function () {
      var route = routeFromHash();
      if (A.state.draft && (route === "new" || route === "details") && isAuthed() && A.hasUnsavedDraft(A.state.draft)) {
        A.toast("Restored your unsaved changes to " + A.describeDraft(A.state.draft) + ".", "details");
      }
      render(route);
    });
  });

  // Used by the other parts of the admin tool.
  A.navigate = navigate;
})((window.PRAdmin = window.PRAdmin || { state: {} }));
