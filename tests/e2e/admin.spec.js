"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const {
  useConfig,
  startEstimate,
  answerScope,
  fillGroup,
  loginAdmin,
  chooseAdmin,
  fillAdminQuote,
} = require("./helpers");

const ROOM = { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 };
const FLOORING_ONLY = { demolition: "No", floorFinish: "Other flooring", walls: "Neither", paintCeiling: "No" };

async function quotesInStorage(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("pr_quotes") || "[]"));
}

test.describe("admin bathroom quote", () => {
  test("prices only the chosen work: $380.00, then floor tile $160.00 replaces flooring", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "1 Pricing St", dims: ROOM, counts: { Cabinet_Quantity: 3 } });
    // Dimensions alone price nothing.
    await expect(page.locator('[data-role="price"]')).toHaveText("$180.00");
    for (const [k, v] of Object.entries(FLOORING_ONLY)) {
      await chooseAdmin(
        page,
        { demolition: "(demolition)", floorFinish: "New floor?", walls: "Walls?", paintCeiling: "Paint the ceiling?" }[
          k
        ],
        v,
      );
    }
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");
    const floorRow = page.locator(".calc-row", { hasText: "New floor?" });
    await expect(floorRow.locator(".calc-cost")).toContainText("$200.00");
    await chooseAdmin(page, "New floor?", "Tile");
    await expect(floorRow.locator(".calc-cost")).toContainText("$160.00");
    await expect(floorRow.locator(".calc-cost")).toContainText("40 sq ft × $4.00");
    await expect(page.locator('[data-role="price"]')).toHaveText("$340.00");
  });

  test("room sizes in feet and inches are converted, and unreadable ones get a format message", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "1 Inches Ave",
      dims: { Bathroom_Width_Ft: "5'6\"", Bathroom_Length_Ft: "8 ft" },
      scope: FLOORING_ONLY,
    });
    await expect(page.locator(".calc-row", { hasText: "New floor?" }).locator(".calc-cost")).toContainText("$220.00");
    await page.fill('input[name="Bathroom_Length_Ft"]', "eight");
    await page.click("#save-quote-btn");
    await expect(page.locator(".calc-dim", { hasText: "Length" }).locator(".calc-error")).toHaveText(
      "Enter the length as a number of feet, e.g. 5.5, or feet and inches, e.g. 5' 6\".",
    );
    await page.fill('input[name="Bathroom_Length_Ft"]', "8");
    await page.click("#save-quote-btn");
    await expect(page.locator(".quote-card", { hasText: "1 Inches Ave" })).toContainText("Total $220.00");
    const saved = (await quotesInStorage(page))[0].data.bathroom.jobValues;
    expect(saved.Bathroom_Width_Ft).toBe(5.5);
  });

  test("create, save (double-click = one quote), edit, download PDF, delete", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "2 Save Ave",
      dims: ROOM,
      scope: FLOORING_ONLY,
      counts: { Cabinet_Quantity: 3 },
    });
    await page.locator("#save-quote-btn").dblclick();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.locator("#admin-toast")).toHaveText("Quote for 2 Save Ave saved.");
    expect(await quotesInStorage(page)).toHaveLength(1);
    const card = page.locator(".quote-card", { hasText: "2 Save Ave" });
    await expect(card).toContainText("Total $380.00");

    // Submitting the form twice in the same tick still makes one quote.
    await page.click("#create-quote-btn");
    await page.fill("#quote-address", "3 Twice Rd");
    await page.click('button:has-text("Get Started")');
    for (const [k, v] of Object.entries(FLOORING_ONLY)) {
      await chooseAdmin(
        page,
        { demolition: "(demolition)", floorFinish: "New floor?", walls: "Walls?", paintCeiling: "Paint the ceiling?" }[
          k
        ],
        v,
      );
    }
    await page.fill('input[name="Bathroom_Width_Ft"]', "4");
    await page.fill('input[name="Bathroom_Length_Ft"]', "6");
    await page.evaluate(() => {
      const form = document.getElementById("step2-form");
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page).toHaveURL(/#\/dashboard$/);
    expect(await quotesInStorage(page)).toHaveLength(2);

    // Edit
    await card.getByRole("button", { name: "View / Edit" }).click();
    await expect(page.locator('input[name="Cabinet_Quantity"]')).toHaveValue("3");
    await page.fill('input[name="Cabinet_Quantity"]', "4");
    await expect(page.locator('[data-role="price"]')).toHaveText("$440.00");
    await page.click("#save-quote-btn");
    await expect(page.locator(".quote-card", { hasText: "2 Save Ave" })).toContainText("Total $440.00");
    expect(await quotesInStorage(page)).toHaveLength(2);

    // Customer PDF
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".quote-card", { hasText: "2 Save Ave" }).getByRole("button", { name: "Download PDF" }).click(),
    ]);
    const pdf = fs.readFileSync(await download.path(), "latin1");
    expect(pdf).toContain("Prepared for: 2 Save Ave");
    expect(pdf).toContain("$440.00");
    expect(pdf).toContain("do not currently hold a contractor licence");

    // Filter by address
    await page.fill("#quote-filter", "twice");
    await expect(page.locator(".quote-card")).toHaveCount(1);
    await expect(page.locator("#quote-count")).toContainText("1 of 2");
    await page.fill("#quote-filter", "");

    // Delete
    page.once("dialog", (d) => d.accept());
    await page.locator(".quote-card", { hasText: "2 Save Ave" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".quote-card", { hasText: "2 Save Ave" })).toHaveCount(0);
    expect(await quotesInStorage(page)).toHaveLength(1);
  });

  test("Back and Get Started keep every value; reload restores the draft; browser Back works", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "4 Draft Ct",
      dims: ROOM,
      scope: FLOORING_ONLY,
      counts: { Cabinet_Quantity: 3 },
    });
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");

    await page.click("#step2-back");
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.locator("#quote-address")).toHaveValue("4 Draft Ct");
    await page.click('button:has-text("Get Started")');
    await expect(page.locator('input[name="Bathroom_Height_Ft"]')).toHaveValue("8");
    await expect(page.locator('input[name="Cabinet_Quantity"]')).toHaveValue("3");
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");

    await page.reload();
    await expect(page).toHaveURL(/#\/details$/);
    await expect(page.locator("#admin-toast")).toContainText("Restored your unsaved changes");
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");

    await page.goBack();
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.locator("#screen-step1")).toBeVisible();
    await page.goForward();
    await expect(page.locator("#screen-step2")).toBeVisible();
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");
  });

  test("Cancel with unsaved changes asks before discarding", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "5 Cancel Pl", dims: ROOM });
    const messages = [];
    page.once("dialog", (d) => {
      messages.push(d.message());
      d.dismiss();
    });
    await page.locator("#screen-step2").getByRole("button", { name: "Cancel" }).first().click();
    expect(messages).toEqual(["Discard this quote's changes?"]);
    await expect(page.locator("#screen-step2")).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.locator("#screen-step2").getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.locator("#screen-dashboard")).toBeVisible();
    expect(await quotesInStorage(page)).toHaveLength(0);
    await expect(page.locator("#draft-banner")).toBeHidden();
  });

  test("saving needs every work question answered and valid numbers", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "6 Check Way", counts: { Toilet_Quantity: "2.5" } });
    await chooseAdmin(page, "(demolition)", "Yes");
    await page.click("#save-quote-btn");
    await expect(page.locator("#step2-error")).toBeVisible();
    await expect(page.locator(".calc-row", { hasText: "New floor?" }).locator(".calc-error")).toHaveText(
      "Choose an answer.",
    );
    await expect(page.locator(".calc-row", { hasText: "Toilets" }).locator(".calc-error")).toContainText(
      "whole number",
    );
    await expect(page.locator(".calc-dim", { hasText: "Width" }).locator(".calc-error")).toContainText(
      "Enter the width",
    );
    expect(await quotesInStorage(page)).toHaveLength(0);
  });

  test("an old saved quote is flagged for review and keeps its old total until re-saved", async ({ page }) => {
    await page.goto("/admin/");
    await page.evaluate(() => {
      localStorage.setItem(
        "pr_quotes",
        JSON.stringify([
          {
            id: "q_old",
            address: "7 Legacy Ln",
            categories: ["bathroom"],
            data: {
              bathroom: {
                jobValues: {
                  Bathroom_Width_Ft: 5,
                  Bathroom_Length_Ft: 8,
                  Bathroom_Height_Ft: 8,
                  Bathroom_SqFt: 40,
                  Wall_SqFt: 208,
                  Cabinet_Quantity: 3,
                },
                lineResults: [],
                totalPrice: 3315.92,
              },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      );
    });
    await loginAdmin(page);
    const card = page.locator(".quote-card", { hasText: "7 Legacy Ln" });
    await expect(card).toContainText("Total $3,315.92");
    await expect(card).toContainText("Needs review: old calculator");
    await expect(card.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    await card.getByRole("button", { name: "Review / Edit" }).click();
    await expect(page.getByTestId("legacy-notice")).toContainText("$3,315.92");
    await expect(page.locator('input[name="Cabinet_Quantity"]')).toHaveValue("3");
    // Nothing is silently charged: only the cabinets until work is chosen.
    await expect(page.locator('[data-role="price"]')).toHaveText("$180.00");
    expect((await page.evaluate(() => JSON.parse(localStorage.pr_quotes)))[0].data.bathroom.totalPrice).toBe(3315.92);
    for (const [q, a] of [
      ["(demolition)", "No"],
      ["New floor?", "Other flooring"],
      ["Walls?", "Neither"],
      ["Paint the ceiling?", "No"],
    ]) {
      await chooseAdmin(page, q, a);
    }
    await page.click("#save-quote-btn");
    await expect(card).toContainText("Total $380.00");
    await expect(card).not.toContainText("Needs review");
  });

  test("a storage failure is reported and the entries stay on screen", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "8 Full Disk Dr", dims: ROOM, scope: FLOORING_ONLY });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "pr_quotes") throw new DOMException("QuotaExceededError", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await page.click("#save-quote-btn");
    await expect(page.locator("#step2-error")).toContainText("Couldn't save this quote in this browser");
    await expect(page.locator("#admin-alert")).toBeVisible();
    await expect(page.locator("#screen-step2")).toBeVisible();
    await expect(page.locator('input[name="Bathroom_Width_Ft"]')).toHaveValue("5");
    await expect(page.locator("#save-quote-btn")).toBeEnabled();
  });

  test("quotes can be exported to JSON and imported again", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "9 Export St", dims: ROOM, scope: FLOORING_ONLY });
    await page.click("#save-quote-btn");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export-quotes-btn")]);
    const file = await download.path();
    const exported = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(exported.quotes).toHaveLength(1);

    await page.evaluate(() => localStorage.setItem("pr_quotes", "[]"));
    await page.reload();
    await expect(page.locator(".quote-card")).toHaveCount(0);
    page.once("dialog", (d) => d.accept());
    await page.setInputFiles("#import-quotes-input", file);
    await expect(page.locator(".quote-card", { hasText: "9 Export St" })).toBeVisible();
  });

  test("Quote Details fits a 375px phone with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "10 Phone Pl",
      dims: ROOM,
      scope: FLOORING_ONLY,
      counts: { Cabinet_Quantity: 3 },
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  });

  test("on desktop every cost sits in one right-hand column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "11 Column Rd",
      dims: ROOM,
      scope: FLOORING_ONLY,
      counts: { Cabinet_Quantity: 3 },
    });
    const rights = await page
      .locator(".calc-row .calc-cost")
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
    expect(new Set(rights).size).toBe(1);
  });
});

test.describe("PDF business line", () => {
  test("the public estimate PDF and the admin quote PDF show the owner's name identically", async ({ page }) => {
    const LINE = "Premium Restoration, operated by Test Owner Name, an individual (not a registered company)";
    // PDF text strings escape their brackets.
    const pdfText = async (download) => fs.readFileSync(await download.path(), "latin1").replace(/\\([()])/g, "$1");
    await useConfig(page, { owner: { legalName: "Test Owner Name" } });

    await startEstimate(page);
    await answerScope(page, FLOORING_ONLY);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    const [publicPdf] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("estimate-card").getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    expect(await pdfText(publicPdf)).toContain(LINE);

    await loginAdmin(page);
    await fillAdminQuote(page, { address: "12 Owner Way", dims: ROOM, scope: FLOORING_ONLY });
    await page.click("#save-quote-btn");
    const [adminPdf] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".quote-card", { hasText: "12 Owner Way" }).getByRole("button", { name: "Download PDF" }).click(),
    ]);
    expect(await pdfText(adminPdf)).toContain(LINE);
  });
});
