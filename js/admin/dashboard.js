// Premium Restoration admin tool — The dashboard: quote list and search, retention clean-up, unsaved drafts,
// and the "differs from the website" price warning.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  // ------------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------------
  // Quotes marked as booked jobs are customer records: never
  // counted as past retention or deleted by the bulk clean-up.
  function isPastRetention(quote) {
    if (quote.ledToWork === true) return false;
    var last = new Date(quote.updatedAt || quote.createdAt).getTime();
    if (isNaN(last)) return false;
    return Date.now() - last > A.QUOTE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  }

  function getRetentionLog() {
    var log = A.readJson(A.RETENTION_LOG_KEY, []);
    return Array.isArray(log) ? log : [];
  }

  function addRetentionLogEntry(type, deletedCount) {
    var log = getRetentionLog();
    log.push({ date: new Date().toISOString(), type: type, deleted: deletedCount });
    return A.writeJson(A.RETENTION_LOG_KEY, log);
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
        A.QUOTE_RETENTION_DAYS +
        " days and not marked as a booked job. Mark any that became jobs, then delete the rest."
      : "No quotes in this browser are past the " + A.QUOTE_RETENTION_DAYS + "-day retention period.";
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
      "Last monthly clean-up logged in this browser: " +
      (lastCleanUp ? A.formatDate(lastCleanUp.date) : "none") +
      ". Old enquiries last deleted: " +
      (lastPurge ? A.formatDate(lastPurge.date) + " (" + lastPurge.deleted + " deleted)" : "none") +
      ".";
    textWrap.appendChild(logText);
    bar.appendChild(textWrap);

    var actions = document.createElement("div");
    actions.className = "admin-inline-actions";
    if (expired.length) {
      actions.appendChild(
        A.makeButton("Delete Old Enquiries", "btn btn-outline-dark", function () {
          A.confirmAction(
            "Delete old enquiries?",
            "Delete " +
              expired.length +
              (expired.length === 1 ? " quote" : " quotes") +
              " not updated in over " +
              A.QUOTE_RETENTION_DAYS +
              " days? Quotes marked as booked jobs are kept. This can't be undone.",
            "Delete " + expired.length + (expired.length === 1 ? " quote" : " quotes"),
          ).then(function (ok) {
            if (!ok) return;
            var ids = A.getQuotes()
              .filter(isPastRetention)
              .map(function (q) {
                return q.id;
              });
            var saved = A.saveQuotes(
              A.getQuotes().filter(function (q) {
                return ids.indexOf(q.id) === -1;
              }),
            );
            if (!saved) return A.alertError(A.STORAGE_ERROR);
            addRetentionLogEntry("quote-purge", ids.length);
            A.toast(ids.length + (ids.length === 1 ? " quote" : " quotes") + " deleted.");
            renderDashboard();
          });
        }),
      );
    }
    actions.appendChild(
      A.makeButton("Log This Month's Clean-Up", "btn btn-outline-dark", function () {
        A.confirmAction(
          "Log this month's clean-up?",
          "Only log today's date once you have deleted, everywhere they are kept (email, voicemail and texts, the form " +
            "service if one is used, quotes in every browser that holds them, and old backup files), enquiries that " +
            "didn't become jobs and are about a month old.",
          "Log clean-up",
          "primary",
        ).then(function (ok) {
          if (!ok) return;
          if (!addRetentionLogEntry("monthly-clean-up", null)) return A.alertError(A.STORAGE_ERROR);
          A.toast("This month's clean-up is logged.");
          renderDashboard();
        });
      }),
    );
    bar.appendChild(actions);
  }

  function getPublishedPriceDrift() {
    var prices = A.Pricing.getPrices();
    return Object.keys(A.Pricing.DEFAULT_PRICES)
      .filter(function (key) {
        return (
          A.Pricing.UNPUBLISHED_PRICE_KEYS.indexOf(key) === -1 &&
          Number(prices[key]) !== Number(A.Pricing.DEFAULT_PRICES[key])
        );
      })
      .map(function (key) {
        return {
          label: A.Pricing.PRICE_LABELS[key] || key,
          saved: prices[key],
          published: A.Pricing.DEFAULT_PRICES[key],
        };
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
      "Set them back here, or change the website's prices in site-config.json (README “Site settings”).";
    box.appendChild(p);
    var ul = document.createElement("ul");
    drift.forEach(function (d) {
      var li = document.createElement("li");
      li.textContent = d.label + ": " + A.money(d.saved) + " here, " + A.money(d.published) + " on the website";
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  // Every quote with unsaved changes (from this tab or another), each with
  // its own Resume and Discard. Drafts are kept per quote, so starting or
  // opening another quote never throws one away.
  function renderDraftBanner() {
    var banner = document.getElementById("draft-banner");
    var drafts = A.unsavedDrafts();
    var list = document.getElementById("draft-list");
    list.innerHTML = "";
    banner.hidden = !drafts.length;
    if (!drafts.length) return;
    document.getElementById("draft-banner-text").textContent =
      drafts.length === 1
        ? "You have unsaved changes to " + A.describeDraft(drafts[0]) + "."
        : "You have unsaved changes to " + drafts.length + " quotes.";
    drafts.forEach(function (d) {
      var item = A.el("li", "draft-item");
      item.setAttribute("data-draft-id", d.id);
      if (drafts.length > 1) item.appendChild(A.el("span", "draft-item-label", A.capitalize(A.describeDraft(d))));
      var actions = A.el("span", "admin-inline-actions");
      var resume = A.makeButton("Resume", "btn btn-primary", function () {
        resumeDraft(d.id);
      });
      resume.setAttribute("aria-label", "Resume " + A.describeDraft(d));
      var discard = A.makeButton("Discard", "btn btn-outline-dark", function () {
        A.confirmDiscardQuote(A.readDraft(d.id) || d).then(function (ok) {
          if (!ok) return;
          A.removeDraft(d.id);
          if (A.state.draft && A.state.draft.id === d.id) A.clearDraft();
          renderDashboard();
          document.getElementById("create-quote-btn").focus();
        });
      });
      discard.setAttribute("aria-label", "Discard unsaved changes to " + A.describeDraft(d));
      actions.appendChild(resume);
      actions.appendChild(discard);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function resumeDraft(id) {
    if (!A.pricesReady()) return;
    var stored = A.readDraft(id);
    if (!stored) return renderDashboard();
    A.state.draft = stored;
    A.persistDraft();
    A.navigate("details");
  }

  // Search by address, customer name, email or phone (digits match however
  // the number was typed).
  function matchesFilter(quote, filter) {
    var c = A.cleanCustomer(quote.customer);
    var text = [quote.address, c.name, c.email, c.phone].join(" ").toLowerCase();
    if (text.indexOf(filter) !== -1) return true;
    var digits = filter.replace(/\D/g, "");
    return digits.length >= 3 && c.phone.replace(/\D/g, "").indexOf(digits) !== -1;
  }

  function renderDashboard() {
    var all = A.getQuotes()
      .slice()
      .sort(function (a, b) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    A.renderBackupPanel();
    renderRetentionBar(all);
    renderDraftBanner();

    var driftSlot = document.getElementById("price-drift-notice");
    driftSlot.innerHTML = "";
    var driftNotice = buildPriceDriftNotice();
    driftSlot.hidden = !driftNotice;
    if (driftNotice) driftSlot.appendChild(driftNotice);

    var filter = /** @type {HTMLInputElement} */ (document.getElementById("quote-filter")).value.trim().toLowerCase();
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
      var legacy = A.Pricing.isLegacyQuoteData(bathroom);

      var card = document.createElement("article");
      card.className = "quote-card";
      card.setAttribute("data-quote-id", quote.id);

      var main = document.createElement("div");
      main.className = "quote-card-main";
      var h2 = document.createElement("h2");
      h2.textContent = quote.address;
      main.appendChild(h2);
      var who = A.customerSummary(quote.customer);
      if (who) main.appendChild(A.el("p", "quote-card-customer", who));

      var meta = document.createElement("p");
      meta.className = "quote-card-meta";
      meta.textContent =
        (quote.createdAt ? "Created " + A.formatDate(quote.createdAt) + " · " : "") +
        "Updated " +
        A.formatDate(quote.updatedAt);
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
      if (Number(bathroom.totalPrice) > 0 || !legacy) chip("Total " + A.money(bathroom.totalPrice), "quote-price-chip");
      if (legacy) chip("Needs review: old calculator", "quote-attention-chip");
      if (quote.ledToWork === true) chip("Job booked", "quote-won-chip");
      if (isPastRetention(quote)) chip("Past retention period", "quote-attention-chip");
      main.appendChild(chips);

      var actions = document.createElement("div");
      actions.className = "quote-card-actions";
      actions.appendChild(
        A.makeButton(legacy ? "Review / Edit" : "View / Edit", "", function () {
          openQuoteForEdit(quote.id);
        }),
      );
      var pdfBtn = A.makeButton("Download PDF", "", function () {
        A.downloadQuotePdf(quote, pdfBtn);
      });
      if (legacy) {
        pdfBtn.disabled = true;
        pdfBtn.title = "Review and save this quote first";
      }
      actions.appendChild(pdfBtn);
      actions.appendChild(
        A.makeButton(quote.ledToWork === true ? "Undo Job Booked" : "Mark Job Booked", "", function () {
          setLedToWork(quote.id, quote.ledToWork !== true);
        }),
      );
      var deleteBtn = A.makeButton("Delete", "danger", function () {
        A.confirmAction(
          "Delete this quote?",
          "Delete the quote for " + quote.address + "? This can't be undone.",
          "Delete quote",
        ).then(function (ok) {
          if (!ok) return;
          var saved = A.saveQuotes(
            A.getQuotes().filter(function (q) {
              return q.id !== quote.id;
            }),
          );
          if (!saved) return A.alertError(A.STORAGE_ERROR);
          A.removeDraft(quote.id);
          A.toast("Quote for " + quote.address + " deleted.");
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
    var quotes = A.getQuotes().map(function (q) {
      if (q.id !== id) return q;
      var updated = Object.assign({}, q, { ledToWork: value, statusChangedAt: now });
      if (!value) delete updated.ledToWork;
      return updated;
    });
    if (!A.saveQuotes(quotes)) return A.alertError(A.STORAGE_ERROR);
    var quote = quotes.filter(function (q) {
      return q.id === id;
    })[0];
    A.toast(
      value
        ? "Quote for " + quote.address + " marked as a booked job. It is kept as a customer record."
        : "Quote for " + quote.address + " is no longer marked as a booked job.",
    );
    renderDashboard();
    var again = /** @type {HTMLElement | null} */ (
      document.querySelector('.quote-card[data-quote-id="' + id + '"] .quote-card-actions button:nth-child(3)')
    );
    if (again) again.focus();
  }

  // Opening a quote carries on with its unsaved changes if there are any;
  // unsaved changes to other quotes are kept (each quote has its own draft).
  function openQuoteForEdit(id) {
    if (!A.pricesReady()) return;
    var quote = A.getQuotes().filter(function (q) {
      return q.id === id;
    })[0];
    if (!quote) return;
    var stored = A.readDraft(id);
    if (A.hasUnsavedDraft(stored)) {
      A.state.draft = stored;
      A.toast("Carrying on with your unsaved changes to " + A.describeDraft(stored) + ".", "details");
    } else {
      A.state.draft = A.draftFromQuote(quote);
    }
    A.persistDraft();
    A.navigate("details");
  }

  // ------------------------------------------------------------------
  // Wire up
  // ------------------------------------------------------------------
  function startNewQuote() {
    if (!A.pricesReady()) return;
    A.state.draft = A.newDraft();
    A.persistDraft();
    A.navigate("details");
  }

  // Used by the other parts of the admin tool.
  A.getRetentionLog = getRetentionLog;
  A.buildPriceDriftNotice = buildPriceDriftNotice;
  A.renderDashboard = renderDashboard;
  A.startNewQuote = startNewQuote;
})((window.PRAdmin = window.PRAdmin || { state: {} }));
