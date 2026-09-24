// Premium Restoration admin tool — Shared pieces of the admin tool: settings keys, checked storage, small DOM
// helpers, the messages area and the confirmation dialog.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  // State shared by the parts (each is set by the part named):
  //   A.state.draft          the quote being edited in this tab, or null (drafts.js)
  //   A.state.currentRoute   the screen shown: "dashboard", "details", "prices" (main.js)
  //   A.state.toastRoute     the screen the current message belongs to (core.js)
  //   A.state.persistence    what the browser said about keeping data (backup.js)
  //   A.state.persistenceAsked  whether it has been asked on this visit (backup.js)
  //   A.state.ratesBaseline  the Business Prices fields as opened, or null (prices.js)
  //   A.state.disclosures    status lines the owner opened or closed by hand (core.js)

  var Pricing = window.BathroomPricing;
  var money = Pricing.money;

  var AUTH_KEY = "pr_admin_authed";
  var QUOTES_KEY = "pr_quotes";
  // One draft per quote ("pr_quote_draft:<quote id>"), so two tabs editing
  // different quotes never overwrite each other. Each tab remembers (in its
  // sessionStorage) which draft it is editing, so a reload reopens it.
  var DRAFT_PREFIX = "pr_quote_draft:";
  var OLD_DRAFT_KEY = "pr_quote_draft"; // before drafts were kept per quote
  var TAB_DRAFT_KEY = "pr_admin_tab_draft";
  var RETENTION_LOG_KEY = "pr_retention_log";
  // When quotes were last exported to a backup file: { at, quoteCount }.
  var BACKUP_KEY = "pr_last_backup";
  // After this many days without a backup the dashboard warns (and it warns
  // straight away if quotes have never been backed up).
  var BACKUP_REMINDER_DAYS = 3;
  var Business = window.BusinessInfo;
  var configReady = window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null);

  // Retention for quotes that didn't lead to work, in days. The public
  // Privacy Notice says enquiries are kept for "about a month"; keep the two
  // in step.
  var QUOTE_RETENTION_DAYS = 30;

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
    "Couldn't save in this browser — its storage is full or blocked (for example in a private window). Nothing on screen has been lost. Try again, free up space by deleting old quotes, or use Export Backup to keep a copy.";

  // Calendar days, not 24-hour periods: a backup made at 11 pm is
  // "yesterday" by 8 am (js/admin/dates.js).
  function daysSince(iso) {
    return window.CalendarDays.calendarDaysBetween(iso, Date.now());
  }

  var describeAge = window.CalendarDays.describeAge;

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many || one + "s");
  }

  // The published prices come from site-config.json. Without them a quote
  // can't be priced, so creating, editing, PDFs and Business Prices wait.
  var PRICES_MISSING =
    "The website's prices couldn't be loaded from site-config.json, so quotes can't be priced right now. Reload the page. " +
    "If this keeps happening, the prices in site-config.json need fixing (see README “Site settings”). Your saved quotes, " +
    "Export Backup and Restore from Backup still work.";

  function pricesReady() {
    if (Pricing.hasPublishedPrices()) return true;
    alertError(PRICES_MISSING);
    return false;
  }

  // ------------------------------------------------------------------
  // Messages
  // ------------------------------------------------------------------
  // Messages sit at the top of the screen in their own space (never over a
  // button) and stay until dismissed, replaced, or the screen changes.
  A.state.toastRoute = null;

  function toast(text, route) {
    document.getElementById("admin-toast").textContent = text;
    document.getElementById("admin-toast-box").hidden = false;
    A.state.toastRoute = route || A.state.currentRoute;
  }

  function hideToast() {
    document.getElementById("admin-toast-box").hidden = true;
    document.getElementById("admin-toast").textContent = "";
    A.state.toastRoute = null;
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
    var dialog = /** @type {HTMLDialogElement} */ (document.getElementById("admin-dialog"));
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

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "unknown date";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function makeButton(text, className, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // ------------------------------------------------------------------
  // Status lines (Backups, Clean-up): a one-line summary whose details open
  // on demand. They open by themselves while something needs doing; once the
  // owner opens or closes one, that choice is kept until the page reloads.
  // ------------------------------------------------------------------
  A.state.disclosures = {};

  function renderDisclosure(name, autoOpen) {
    var toggle = /** @type {HTMLElement} */ (document.getElementById(name + "-toggle"));
    var details = /** @type {HTMLElement} */ (document.getElementById(name + "-details"));
    var chosen = A.state.disclosures[name];
    var open = typeof chosen === "boolean" ? chosen : autoOpen;
    details.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function initDisclosure(name, render) {
    var toggle = /** @type {HTMLElement} */ (document.getElementById(name + "-toggle"));
    toggle.addEventListener("click", function () {
      A.state.disclosures[name] = toggle.getAttribute("aria-expanded") !== "true";
      render();
    });
  }

  // Used by the other parts of the admin tool.
  A.Pricing = Pricing;
  A.money = money;
  A.AUTH_KEY = AUTH_KEY;
  A.QUOTES_KEY = QUOTES_KEY;
  A.DRAFT_PREFIX = DRAFT_PREFIX;
  A.OLD_DRAFT_KEY = OLD_DRAFT_KEY;
  A.TAB_DRAFT_KEY = TAB_DRAFT_KEY;
  A.RETENTION_LOG_KEY = RETENTION_LOG_KEY;
  A.BACKUP_KEY = BACKUP_KEY;
  A.BACKUP_REMINDER_DAYS = BACKUP_REMINDER_DAYS;
  A.Business = Business;
  A.configReady = configReady;
  A.QUOTE_RETENTION_DAYS = QUOTE_RETENTION_DAYS;
  A.readJson = readJson;
  A.writeJson = writeJson;
  A.removeKey = removeKey;
  A.getQuotes = getQuotes;
  A.saveQuotes = saveQuotes;
  A.STORAGE_ERROR = STORAGE_ERROR;
  A.daysSince = daysSince;
  A.describeAge = describeAge;
  A.plural = plural;
  A.renderDisclosure = renderDisclosure;
  A.initDisclosure = initDisclosure;
  A.PRICES_MISSING = PRICES_MISSING;
  A.pricesReady = pricesReady;
  A.toast = toast;
  A.hideToast = hideToast;
  A.alertError = alertError;
  A.confirmAction = confirmAction;
  A.formatDate = formatDate;
  A.makeButton = makeButton;
  A.capitalize = capitalize;
  A.el = el;
})((window.PRAdmin = window.PRAdmin || { state: {} }));
