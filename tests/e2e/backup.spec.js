"use strict";

// Quotes live only in this browser (no server), so the admin dashboard must:
// ask the browser to keep the data and say whether it agreed, record every
// backup, warn until a recent backup exists, and restore a backup in one step
// after the browser's storage has been cleared.

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { loginAdmin, fillAdminQuote } = require("./helpers");

const ROOM = { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 };
const FLOORING_ONLY = { demolition: "No", floorFinish: "Other flooring", walls: "Neither", paintCeiling: "No" };

// Replace navigator.storage before the page's scripts run.
async function stubPersistence(page, { persisted, grant }) {
  await page.addInitScript(
    ({ persisted, grant }) => {
      window.__persistCalls = 0;
      if (persisted === "unsupported") {
        Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
        return;
      }
      let state = persisted;
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: {
          persisted: () => Promise.resolve(state),
          persist: () => {
            window.__persistCalls++;
            state = Array.isArray(grant) ? grant[Math.min(window.__persistCalls - 1, grant.length - 1)] : grant;
            return Promise.resolve(state);
          },
        },
      });
    },
    { persisted, grant },
  );
}

async function saveQuote(page, address) {
  await fillAdminQuote(page, { address, dims: ROOM, scope: FLOORING_ONLY });
  await page.click("#save-quote-btn");
  await expect(page.locator(".quote-card", { hasText: address })).toBeVisible();
}

test.describe("admin backups", () => {
  test("warns until backed up, records the backup, and one step restores it after storage is cleared", async ({
    page,
    context,
  }) => {
    await stubPersistence(page, { persisted: false, grant: false });
    await loginAdmin(page);
    const panel = page.locator("#backup-panel");
    await expect(page.locator("#backup-status")).toHaveText("Nothing to back up yet.");
    await expect(page.locator("#export-quotes-btn")).toBeDisabled();
    // The empty dashboard says so once, in the quote list's place.
    await expect(page.locator("#quote-list-empty")).toHaveText(
      'No quotes in this browser. Choose "Create New Quote" to get started. If you had quotes here before, the browser ' +
        'may have cleared its storage: choose "Restore from Backup" and pick your latest backup file.',
    );
    expect((await page.locator("body").innerText()).match(/No quotes in this browser/g)).toHaveLength(1);

    await saveQuote(page, "1 Backup Rd");
    await saveQuote(page, "2 Backup Rd");
    // Never backed up: a visible warning that can't be dismissed, with Export Now.
    await expect(panel).toHaveAttribute("data-backup", "due");
    await expect(page.locator("#backup-status")).toHaveText(
      "Last backup: never. These 2 quotes exist only in this browser — Export now and keep the file somewhere else.",
    );
    await expect(panel.getByRole("button", { name: "Export Now" })).toHaveClass(/btn-primary/);

    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export-quotes-btn")]);
    const file = await download.path();
    const backup = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(backup.version).toBe(2);
    expect(backup.quotes.map((q) => q.address).sort()).toEqual(["1 Backup Rd", "2 Backup Rd"]);
    expect(Array.isArray(backup.retentionLog)).toBe(true);
    await expect(panel).toHaveAttribute("data-backup", "ok");
    await expect(page.locator("#backup-status")).toContainText("Last backup: today");
    await expect(page.locator("#backup-status")).toContainText("with every quote as it is now");
    await expect(page.locator("#admin-toast")).toContainText("Backup of 2 quotes downloaded");

    // A change after the backup is counted.
    await page.locator(".quote-card", { hasText: "1 Backup Rd" }).getByRole("button", { name: "View / Edit" }).click();
    await page.fill('input[name="Cabinet_Quantity"]', "1");
    await page.click("#save-quote-btn");
    await expect(page.locator("#backup-status")).toContainText("1 quote added or changed since");

    // Five days later the warning is back.
    await page.evaluate(() => {
      const b = JSON.parse(localStorage.getItem("pr_last_backup"));
      b.at = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem("pr_last_backup", JSON.stringify(b));
    });
    await page.reload();
    await expect(panel).toHaveAttribute("data-backup", "due");
    await expect(page.locator("#backup-status")).toContainText("Last backup: 5 days ago");
    await expect(page.locator("#backup-status")).toContainText("— Export now.");

    // The browser clears the site's data (as Safari does after 7 days, or "clear browsing data").
    const cdp = await context.newCDPSession(page);
    await cdp.send("Storage.clearDataForOrigin", { origin: new URL(page.url()).origin, storageTypes: "all" });
    await page.evaluate(() => sessionStorage.clear());
    await loginAdmin(page);
    await expect(page.locator(".quote-card")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("pr_quotes"))).toBeNull();
    await expect(page.locator("#quote-list-empty")).toContainText("the browser may have cleared its storage");
    // With no quotes, the empty message has Restore from Backup, and it opens the file chooser.
    const restore = page.locator("#dashboard-empty").getByRole("button", { name: "Restore from Backup" });
    await expect(restore).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), restore.click()]);
    expect(chooser.isMultiple()).toBe(false);

    // One step: choosing the file restores it, no questions.
    await page.setInputFiles("#import-quotes-input", file);
    await expect(page.locator(".quote-card")).toHaveCount(2);
    await expect(page.locator("#admin-dialog")).toBeHidden();
    await expect(page.locator("#admin-toast")).toContainText("Restored 2 quotes from the backup of");
    // That file is now the latest backup.
    await expect(page.locator("#backup-status")).toContainText("Last backup: today");

    // Restoring the same file again changes nothing.
    await page.setInputFiles("#import-quotes-input", file);
    await expect(page.locator("#admin-toast")).toContainText("Nothing new to restore");
  });

  test("a backup also carries Business Prices to a new browser", async ({ page, browser }) => {
    await loginAdmin(page);
    await page.click("#open-rates-btn");
    await page.fill("#rate-Toilet_Price", "250");
    await page.getByRole("button", { name: "Save Prices" }).click();
    await saveQuote(page, "3 Prices Way");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export-quotes-btn")]);

    const fresh = await (await browser.newContext()).newPage();
    await loginAdmin(fresh);
    await fresh.setInputFiles("#import-quotes-input", await download.path());
    await expect(fresh.locator("#admin-toast")).toContainText("Business Prices were restored too");
    await fresh.click("#open-rates-btn");
    await expect(fresh.locator("#rate-Toilet_Price")).toHaveValue("250");
  });

  test("asks the browser to keep the data, and says so when it agrees", async ({ page }) => {
    await stubPersistence(page, { persisted: false, grant: true });
    await loginAdmin(page);
    const storage = page.locator("#storage-status");
    await expect(storage).toHaveAttribute("data-persistence", "persisted");
    await expect(storage).toContainText("Storage: protected");
    await expect(page.locator("#persist-retry-btn")).toBeHidden();
    expect(await page.evaluate(() => window.__persistCalls)).toBe(1);
  });

  test("warns clearly when the browser won't promise to keep the data, and can ask again", async ({ page }) => {
    await stubPersistence(page, { persisted: false, grant: [false, true] });
    await loginAdmin(page);
    const storage = page.locator("#storage-status");
    await expect(storage).toHaveAttribute("data-persistence", "not-persisted");
    await expect(storage).toContainText("Storage: not protected");
    await expect(storage).toContainText("can delete them without warning");
    await expect(storage).toHaveClass(/is-warning/);
    // The backup line carries the short version.
    await expect(page.locator("#storage-chip")).toHaveText("Storage not protected");
    await page.getByRole("button", { name: "Backup Details" }).click();
    await page.getByRole("button", { name: "Ask Browser to Keep Data" }).click();
    await expect(page.locator("#admin-toast")).toContainText("The browser has agreed to keep this tool's data.");
    await expect(storage).toContainText("Storage: protected");
    await expect(page.locator("#storage-chip")).toBeHidden();
  });

  test("a browser that can't keep data at all gets the same clear warning", async ({ page }) => {
    await stubPersistence(page, { persisted: "unsupported" });
    await loginAdmin(page);
    await expect(page.locator("#storage-status")).toHaveAttribute("data-persistence", "unsupported");
    await expect(page.locator("#storage-status")).toContainText("Storage: not guaranteed");
    await expect(page.locator("#storage-chip")).toHaveText("Storage not guaranteed");
  });
});

// On a phone the quote list comes first: backups and clean-up are one line
// each, and only become prominent when something is due.
test.describe("admin dashboard on a phone", () => {
  test.use({ viewport: { width: 375, height: 900 } });

  async function seedQuote(page, { backedUpDaysAgo }) {
    await page.goto("/admin/");
    await page.evaluate((backedUpDaysAgo) => {
      const now = new Date().toISOString();
      const quote = {
        id: "q_phone",
        address: "12 Phone Street",
        customer: { name: "Pat Example", phone: "801-555-0100" },
        data: { bathroom: { calcVersion: 2, jobValues: { Cabinet_Quantity: 1 }, scope: {}, totalPrice: 60 } },
        createdAt: now,
        updatedAt: now,
      };
      localStorage.setItem("pr_quotes", JSON.stringify([quote]));
      if (backedUpDaysAgo !== null) {
        const at = new Date(Date.now() - backedUpDaysAgo * 24 * 60 * 60 * 1000 + 60 * 1000).toISOString();
        localStorage.setItem("pr_last_backup", JSON.stringify({ at, quoteCount: 1 }));
      }
    }, backedUpDaysAgo);
  }

  test("the quote and Create New Quote are on screen without scrolling; an overdue backup still can't be missed", async ({
    page,
  }) => {
    await stubPersistence(page, { persisted: false, grant: false });
    await seedQuote(page, { backedUpDaysAgo: 5 });
    await loginAdmin(page);
    const card = page.locator(".quote-card", { hasText: "12 Phone Street" });
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(card).toBeInViewport({ ratio: 1 });
    await expect(page.locator("#create-quote-btn")).toBeInViewport({ ratio: 1 });

    // Overdue: the backup line is red, says so, and has Export Now on screen.
    const panel = page.locator("#backup-panel");
    await expect(panel).toHaveClass(/is-due/);
    await expect(page.locator("#backup-status")).toContainText("Last backup: 5 days ago");
    await expect(page.locator("#backup-status")).toContainText("— Export now.");
    const exportNow = panel.getByRole("button", { name: "Export Now" });
    await expect(exportNow).toBeInViewport({ ratio: 1 });
    await expect(exportNow).toHaveClass(/btn-primary/);
    expect(await page.locator("#backup-status").evaluate((node) => getComputedStyle(node).fontWeight)).toBe("600");
    await expect(page.locator("#storage-chip")).toHaveText("Storage not protected");

    // The rest opens on demand.
    const toggle = page.getByRole("button", { name: "Backup Details" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#storage-status")).toBeHidden();
    await expect(panel.locator("label", { hasText: "Restore from Backup" })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#storage-status")).toContainText("Storage: not protected");
    await expect(panel.locator("label", { hasText: "Restore from Backup" })).toBeVisible();
    await toggle.click();
    await expect(page.locator("#storage-status")).toBeHidden();

    // Nothing is due for clean-up: one quiet line, details on demand.
    const retention = page.locator("#retention-bar");
    await expect(retention).toHaveAttribute("data-retention", "ok");
    await expect(page.locator("#retention-summary")).toHaveText("Nothing past 30 days.");
    await expect(page.getByRole("button", { name: "Log This Month's Clean-Up" })).toBeHidden();
    await page.getByRole("button", { name: "Clean-up Details" }).click();
    await expect(page.getByRole("button", { name: "Log This Month's Clean-Up" })).toBeVisible();

    // The data-handling note is one line under the list until opened.
    const note = page.locator(".admin-footnote");
    await expect(note.getByText("Data handling: quotes contain")).toBeHidden();
    await note.locator("summary").click();
    await expect(note.getByText("Data handling: quotes contain")).toBeVisible();
  });

  test("a recent backup is a quiet line", async ({ page }) => {
    await seedQuote(page, { backedUpDaysAgo: 0 });
    await loginAdmin(page);
    const panel = page.locator("#backup-panel");
    await expect(panel).toHaveAttribute("data-backup", "ok");
    await expect(panel).not.toHaveClass(/is-due/);
    await expect(page.locator("#backup-status")).toContainText("Last backup: today");
    await expect(panel.getByRole("button", { name: "Export Backup" })).toHaveClass(/btn-outline-dark/);
    await expect(page.locator(".quote-card")).toBeInViewport({ ratio: 1 });

    // If the quotes go but the backup record stays, the one empty message says when they were backed up.
    await page.evaluate(() => localStorage.removeItem("pr_quotes"));
    await page.reload();
    await expect(page.locator("#quote-list-empty")).toContainText(
      "No quotes in this browser, but 1 quote was backed up",
    );
    await expect(page.locator("#quote-list-empty")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Restore from Backup" })).toBeInViewport();
    await expect(page.locator("#quote-filter")).toBeHidden();
    await expect(page.locator("#backup-status")).toHaveText("Nothing to back up yet.");
    expect((await page.locator("body").innerText()).match(/No quotes in this browser/g)).toHaveLength(1);
  });
});
