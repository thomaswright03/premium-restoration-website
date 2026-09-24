// Premium Restoration admin tool — Backups. Quotes exist only in this browser, which can clear them without
// warning (Safari after 7 days without a visit, "clear browsing data", a new
// device). So: ask the browser to keep the data, record every backup, keep a
// warning on the dashboard until a recent backup exists, and restore a
// backup file in one step.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  // ------------------------------------------------------------------
  // Backups. Quotes exist only in this browser, which can clear them without
  // warning (Safari after 7 days without a visit, "clear browsing data", a
  // new device). So: ask the browser to keep the data, record every backup,
  // and keep a warning on the dashboard until a recent backup exists.
  // ------------------------------------------------------------------
  function getLastBackup() {
    var b = A.readJson(A.BACKUP_KEY, null);
    return b && typeof b.at === "string" && !isNaN(new Date(b.at).getTime()) ? b : null;
  }

  function recordBackup(at, quoteCount) {
    return A.writeJson(A.BACKUP_KEY, { at: at, quoteCount: quoteCount });
  }

  // "persisted": the browser agreed not to clear the data on its own;
  // "not-persisted": it may; "unsupported": it can't say; null: still asking.
  A.state.persistence = null;
  A.state.persistenceAsked = false;

  function checkPersistence(ask) {
    var storage = navigator.storage;
    if (!storage || typeof storage.persisted !== "function") {
      A.state.persistence = "unsupported";
      renderBackupPanel();
      return Promise.resolve(A.state.persistence);
    }
    return storage
      .persisted()
      .then(function (already) {
        if (already || !ask || typeof storage.persist !== "function") return already;
        return storage.persist();
      })
      .then(
        function (granted) {
          A.state.persistence = granted ? "persisted" : "not-persisted";
        },
        function () {
          A.state.persistence = "not-persisted";
        },
      )
      .then(function () {
        renderBackupPanel();
        return A.state.persistence;
      });
  }

  var PERSISTENCE_TEXT = {
    persisted:
      "Storage: protected. This browser has agreed not to clear these quotes on its own. Clearing browsing data, " +
      "Safari's 7-day limit for sites not opened, or a lost or new device can still remove them, so keep exporting backups.",
    "not-persisted":
      "Storage: not protected. This browser hasn't agreed to keep these quotes and can delete them without warning — " +
      "for example Safari after 7 days without opening this tool, or any browser when space runs low or browsing data " +
      "is cleared. Export a backup at the end of every day you add or change quotes. (Firefox asks you when you press " +
      "the button; Chrome and Edge decide for themselves, and are more likely to agree once this page is bookmarked.)",
    unsupported:
      "Storage: not guaranteed. This browser can't promise to keep saved quotes, so it may delete them without warning. " +
      "Export a backup at the end of every day you add or change quotes.",
  };

  function renderBackupPanel() {
    var panel = document.getElementById("backup-panel");
    if (!panel) return;
    var quotes = A.getQuotes();
    var last = getLastBackup();
    var status = document.getElementById("backup-status");
    var exportBtn = /** @type {HTMLButtonElement} */ (document.getElementById("export-quotes-btn"));
    var text;
    var due = false;
    if (!quotes.length) {
      text = last
        ? "No quotes in this browser, but " +
          A.plural(last.quoteCount || 0, "quote") +
          " were backed up here on " +
          A.formatDate(last.at) +
          ". If you didn't delete them, the browser may have cleared its storage: choose Restore from Backup and pick your latest backup file."
        : "No quotes in this browser. If you had quotes here before, the browser may have cleared its storage: choose Restore from Backup and pick your latest backup file.";
    } else if (!last) {
      due = true;
      text =
        "Last backup: never. " +
        (quotes.length === 1 ? "This quote exists" : "These " + quotes.length + " quotes exist") +
        " only in this browser — Export now and keep the file somewhere else.";
    } else {
      var days = A.daysSince(last.at);
      var changed = quotes.filter(function (q) {
        return A.lastChanged(q) > new Date(last.at).getTime();
      }).length;
      due = days >= A.BACKUP_REMINDER_DAYS;
      text =
        "Last backup: " +
        A.describeAge(days) +
        " (" +
        A.formatDate(last.at) +
        ")" +
        (changed ? ". " + A.plural(changed, "quote") + " added or changed since" : ", with every quote as it is now") +
        (due ? " — Export now." : changed ? ". Export again before you finish for the day." : ".");
    }
    status.textContent = text;
    panel.classList.toggle("is-due", due);
    panel.setAttribute("data-backup", !quotes.length ? "empty" : due ? "due" : "ok");
    exportBtn.textContent = due ? "Export Now" : "Export Backup";
    exportBtn.className = "btn " + (due ? "btn-primary" : "btn-outline-dark");
    exportBtn.disabled = !quotes.length;

    var storageEl = document.getElementById("storage-status");
    storageEl.hidden = !A.state.persistence;
    storageEl.textContent = A.state.persistence ? PERSISTENCE_TEXT[A.state.persistence] : "";
    storageEl.className =
      "backup-status" + (A.state.persistence && A.state.persistence !== "persisted" ? " is-warning" : "");
    storageEl.setAttribute("data-persistence", A.state.persistence || "");
    document.getElementById("persist-retry-btn").hidden = A.state.persistence !== "not-persisted";
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

  // A backup file holds every quote (with customer details), the Business
  // Prices saved in this browser and the clean-up log, so a new browser or
  // device can be set up from it in one step.
  function exportQuotes() {
    var quotes = A.getQuotes();
    if (!quotes.length) return A.toast("There are no quotes to back up.");
    var now = new Date().toISOString();
    var saved = A.readJson(A.Pricing.RATES_KEY, null);
    var payload = {
      app: "premium-restoration-quotes",
      version: 2,
      exportedAt: now,
      quotes: quotes,
      businessPrices: saved && saved.prices ? saved.prices : null,
      retentionLog: A.getRetentionLog(),
    };
    var filename = "premium-restoration-quotes-" + now.slice(0, 10) + ".json";
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename);
    recordBackup(now, quotes.length);
    renderBackupPanel();
    A.toast(
      "Backup of " +
        A.plural(quotes.length, "quote") +
        " downloaded as " +
        filename +
        ". Keep it somewhere other than this browser (for example the business's cloud drive), and delete old backup files in the monthly clean-up.",
    );
  }

  // Restoring is one step: choosing the file restores it. It never deletes
  // anything: quotes not in this browser are added, and a quote already here
  // is replaced only by a newer copy.
  function importQuotes(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      var incoming;
      try {
        parsed = JSON.parse(String(reader.result));
        incoming = Array.isArray(parsed) ? parsed : parsed && parsed.quotes;
        if (!Array.isArray(incoming)) throw new Error("no quotes");
        incoming = incoming.filter(function (q) {
          return q && typeof q.id === "string" && typeof q.address === "string" && q.data;
        });
      } catch (e) {
        return A.alertError("That file isn't a backup from this tool, so nothing was restored.");
      }
      if (!incoming.length) return A.alertError("That file has no quotes in it, so nothing was restored.");
      var quotes = A.getQuotes();
      var wasEmpty = !quotes.length;
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
        } else if (A.lastChanged(q) > A.lastChanged(quotes[byId[q.id]])) {
          quotes[byId[q.id]] = q;
          updated++;
        }
      });
      var extras = restoreExtras(parsed);
      if (!added && !updated) {
        return A.toast("Nothing new to restore: every quote in that file is already here and up to date." + extras);
      }
      if (!A.saveQuotes(quotes)) return A.alertError(A.STORAGE_ERROR);
      var exportedAt = parsed && typeof parsed.exportedAt === "string" ? parsed.exportedAt : null;
      // Restored into an empty browser: that file is now an up-to-date backup.
      if (wasEmpty && exportedAt && !isNaN(new Date(exportedAt).getTime())) recordBackup(exportedAt, quotes.length);
      A.toast(
        "Restored " +
          A.plural(added, "quote") +
          (updated ? " and updated " + A.plural(updated, "quote") + " with newer copies" : "") +
          (exportedAt ? " from the backup of " + A.formatDate(exportedAt) : "") +
          "." +
          extras,
      );
      A.renderDashboard();
    };
    reader.onerror = function () {
      A.alertError("That file couldn't be read, so nothing was restored.");
    };
    reader.readAsText(file);
  }

  // Business Prices (only if none are saved in this browser) and the
  // clean-up log from a backup file. Returns a sentence for the message.
  function restoreExtras(parsed) {
    if (!parsed || Array.isArray(parsed)) return "";
    var notes = "";
    var hasPrices = A.readJson(A.Pricing.RATES_KEY, null);
    if (parsed.businessPrices && typeof parsed.businessPrices === "object" && !(hasPrices && hasPrices.prices)) {
      var prices = {};
      Object.keys(parsed.businessPrices).forEach(function (key) {
        var n = Number(parsed.businessPrices[key]);
        if (Object.prototype.hasOwnProperty.call(A.Pricing.DEFAULT_PRICES, key) && isFinite(n) && n >= 0) {
          prices[key] = n;
        }
      });
      if (Object.keys(prices).length && A.writeJson(A.Pricing.RATES_KEY, { prices: prices })) {
        notes += " Business Prices were restored too.";
      }
    }
    if (Array.isArray(parsed.retentionLog) && parsed.retentionLog.length) {
      var log = A.getRetentionLog();
      var seen = {};
      log.forEach(function (e) {
        seen[e.type + "|" + e.date] = true;
      });
      var more = parsed.retentionLog.filter(function (e) {
        return e && typeof e.date === "string" && typeof e.type === "string" && !seen[e.type + "|" + e.date];
      });
      if (more.length) {
        A.writeJson(
          A.RETENTION_LOG_KEY,
          log.concat(more).sort(function (x, y) {
            return new Date(x.date).getTime() - new Date(y.date).getTime();
          }),
        );
      }
    }
    return notes;
  }

  // Used by the other parts of the admin tool.
  A.checkPersistence = checkPersistence;
  A.renderBackupPanel = renderBackupPanel;
  A.exportQuotes = exportQuotes;
  A.importQuotes = importQuotes;
})((window.PRAdmin = window.PRAdmin || { state: {} }));
