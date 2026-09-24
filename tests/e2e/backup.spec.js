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
    await expect(panel).toContainText("No quotes in this browser");
    await expect(page.locator("#export-quotes-btn")).toBeDisabled();

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
    await expect(page.locator("#backup-status")).toContainText("the browser may have cleared its storage");
    await expect(panel.locator("label", { hasText: "Restore from Backup" })).toBeVisible();

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
    await page.getByRole("button", { name: "Ask Browser to Keep Data" }).click();
    await expect(page.locator("#admin-toast")).toContainText("The browser has agreed to keep this tool's data.");
    await expect(storage).toContainText("Storage: protected");
  });

  test("a browser that can't keep data at all gets the same clear warning", async ({ page }) => {
    await stubPersistence(page, { persisted: "unsupported" });
    await loginAdmin(page);
    await expect(page.locator("#storage-status")).toHaveAttribute("data-persistence", "unsupported");
    await expect(page.locator("#storage-status")).toContainText("Storage: not guaranteed");
  });
});
