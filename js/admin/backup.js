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
  /** @returns {LastBackup | null} */
  function getLastBackup() {
    var b = A.readJson(A.BACKUP_KEY, null);
    return b && typeof b.at === "string" && !isNaN(new Date(b.at).getTime()) ? b : null;
  }

  /**
   * @param {string} at
   * @param {number} quoteCount
   */
  function recordBackup(at, quoteCount) {
    return A.writeJson(A.BACKUP_KEY, { at: at, quoteCount: quoteCount });
  }

  // "persisted": the browser agreed not to clear the data on its own;
  // "not-persisted": it may; "unsupported": it can't say; null: still asking.
  A.state.persistence = null;
  A.state.persistenceAsked = false;

  /**
   * @param {boolean} [ask] also ask the browser to keep the data (not just what it has decided)
   * @returns {Promise<string>}
   */
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

  /** @type {Record<string, string>} */
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

  // The short version beside the backup line (the full text is in the details).
  /** @type {Record<string, string>} */
  var PERSISTENCE_CHIP = { "not-persisted": "Storage not protected", unsupported: "Storage not guaranteed" };

  // The dashboard's one message when there are no quotes. If quotes were
  // backed up here before, they may have been cleared by the browser.
  function emptyListMessage() {
    var last = getLastBackup();
    var restore =
      'the browser may have cleared its storage: choose "Restore from Backup" and pick your latest backup file.';
    return last
      ? "No quotes in this browser, but " +
          A.plural(last.quoteCount || 0, "quote") +
          (last.quoteCount === 1 ? " was" : " were") +
          " backed up here on " +
          A.formatDate(last.at) +
          ". If you didn't delete them, " +
          restore
      : 'No quotes in this browser. Choose "Create New Quote" to get started. If you had quotes here before, ' +
          restore;
  }

  /**
   * @param {Quote[]} quotes
   * @param {LastBackup | null} last
   */
  function backupLine(quotes, last) {
    if (!quotes.length) return { text: "Nothing to back up yet.", due: false };
    if (!last) {
      return {
        due: true,
        text:
          "Last backup: never. " +
          (quotes.length === 1 ? "This quote exists" : "These " + quotes.length + " quotes exist") +
          " only in this browser — Export now and keep the file somewhere else.",
      };
    }
    var days = A.daysSince(last.at);
    var changed = quotes.filter(function (q) {
      return A.lastChanged(q) > new Date(last.at).getTime();
    }).length;
    var due = days >= A.BACKUP_REMINDER_DAYS;
    return {
      due: due,
      text:
        "Last backup: " +
        A.describeAge(days) +
        " (" +
        A.formatDate(last.at) +
        ")" +
        (changed ? ". " + A.plural(changed, "quote") + " added or changed since" : ", with every quote as it is now") +
        (due ? " — Export now." : changed ? ". Export again before you finish for the day." : "."),
    };
  }

  // One line: when the last backup was made. It turns red with Export Now
  // while a backup is due. Whether the browser agreed to keep the data, and
  // Restore from Backup, are under "Backup details" (with no quotes, the
  // dashboard's empty message has its own Restore from Backup button).
  function renderBackupPanel() {
    var panel = document.getElementById("backup-panel");
    if (!panel) return;
    /** @type {Quote[]} */
    var quotes = A.getQuotes();
    var line = backupLine(quotes, getLastBackup());
    A.byId("backup-status").textContent = line.text;
    panel.classList.toggle("is-due", line.due);
    panel.setAttribute("data-backup", !quotes.length ? "empty" : line.due ? "due" : "ok");
    var exportBtn = /** @type {HTMLButtonElement} */ (A.byId("export-quotes-btn"));
    exportBtn.textContent = line.due ? "Export Now" : "Export Backup";
    exportBtn.className = "btn " + (line.due ? "btn-primary" : "btn-outline-dark");
    exportBtn.disabled = !quotes.length;

    var persistence = A.state.persistence;
    var storageEl = A.byId("storage-status");
    storageEl.hidden = !persistence;
    storageEl.textContent = persistence ? PERSISTENCE_TEXT[persistence] : "";
    storageEl.className = "backup-status" + (persistence && persistence !== "persisted" ? " is-warning" : "");
    storageEl.setAttribute("data-persistence", persistence || "");
    var chip = A.byId("storage-chip");
    chip.textContent = PERSISTENCE_CHIP[persistence] || "";
    chip.hidden = !PERSISTENCE_CHIP[persistence];
    A.byId("persist-retry-btn").hidden = persistence !== "not-persisted";
    A.renderDisclosure("backup", false);
  }

  // ------------------------------------------------------------------
  // Export / import (JSON) so quotes can leave this browser
  // ------------------------------------------------------------------
  /**
   * @param {Blob | MediaSource} blob
   * @param {string} filename
   */
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
    /** @type {Quote[]} */
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
  /** @param {Blob} file */
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
      /** @type {Quote[]} */
      var quotes = A.getQuotes();
      var wasEmpty = !quotes.length;
      /** @type {Record<string, number>} */
      var byId = {};
      quotes.forEach(function (q, i) {
        byId[q.id] = i;
      });
      var added = 0;
      var updated = 0;
      incoming.forEach(function (/** @type {Quote} */ q) {
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
  /** @param {BackupFile | Quote[] | null} parsed (an early backup was a bare list of quotes) */
  function restoreExtras(parsed) {
    if (!parsed || Array.isArray(parsed)) return "";
    var notes = "";
    var hasPrices = A.readJson(A.Pricing.RATES_KEY, null);
    if (parsed.businessPrices && typeof parsed.businessPrices === "object" && !(hasPrices && hasPrices.prices)) {
      var saved = parsed.businessPrices;
      /** @type {Prices} */
      var prices = {};
      Object.keys(saved).forEach(function (key) {
        var n = Number(saved[key]);
        if (Object.prototype.hasOwnProperty.call(A.Pricing.DEFAULT_PRICES, key) && isFinite(n) && n >= 0) {
          prices[key] = n;
        }
      });
      if (Object.keys(prices).length && A.writeJson(A.Pricing.RATES_KEY, { prices: prices })) {
        notes += " Business Prices were restored too.";
      }
    }
    if (Array.isArray(parsed.retentionLog) && parsed.retentionLog.length) {
      /** @type {RetentionLogEntry[]} */
      var log = A.getRetentionLog();
      /** @type {Record<string, boolean>} */
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
  A.emptyListMessage = emptyListMessage;
  A.exportQuotes = exportQuotes;
  A.importQuotes = importQuotes;
})((window.PRAdmin = window.PRAdmin || /** @type {AdminNamespace} */ ({ state: {} })));
