"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const {
  answerDialog,
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
      const form = document.getElementById("quote-form");
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

    // Delete: the site's own dialog; Escape and Cancel keep the quote
    const deleteBtn = page.locator(".quote-card", { hasText: "2 Save Ave" }).getByRole("button", { name: /^Delete/ });
    await expect(deleteBtn).toHaveCSS(
      "color",
      await deleteBtn.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-danger)";
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }),
    );
    await deleteBtn.click();
    const dialog = page.locator("#admin-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toHaveText("Delete this quote?");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(deleteBtn).toBeFocused();
    expect(await quotesInStorage(page)).toHaveLength(2);
    await deleteBtn.click();
    await answerDialog(page, "Delete quote");
    await expect(page.locator(".quote-card", { hasText: "2 Save Ave" })).toHaveCount(0);
    expect(await quotesInStorage(page)).toHaveLength(1);
  });

  test("one screen from Create New Quote to Save Quote; reload restores the draft; browser Back asks", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.click("#create-quote-btn");
    await expect(page).toHaveURL(/#\/details$/);
    // Address, customer and calculator are all on the same screen.
    for (const id of ["#quote-address", "#quote-customer-name", "#quote-customer-phone", "#quote-customer-email"]) {
      await expect(page.locator(id)).toBeVisible();
    }
    await expect(page.locator('input[name="Bathroom_Width_Ft"]')).toBeVisible();
    await expect(page.locator("#save-quote-btn")).toBeVisible();
    await expect(page.locator('label[for="quote-address"]')).toHaveText("Property address");
    await page.goBack();
    await expect(page.locator("#screen-dashboard")).toBeVisible();

    await fillAdminQuote(page, {
      address: "4 Draft Ct",
      dims: ROOM,
      scope: FLOORING_ONLY,
      counts: { Cabinet_Quantity: 3 },
    });
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");

    await page.reload();
    await expect(page).toHaveURL(/#\/details$/);
    await expect(page.locator("#admin-toast")).toContainText(
      "Restored your unsaved changes to the quote for 4 Draft Ct",
    );
    await expect(page.locator("#quote-address")).toHaveValue("4 Draft Ct");
    await expect(page.locator('input[name="Bathroom_Height_Ft"]')).toHaveValue("8");
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");

    // Browser Back with unsaved changes asks first; "Cancel" stays put.
    await page.goBack();
    await expect(page.locator("#admin-dialog")).toBeVisible();
    await answerDialog(page, "Cancel");
    await expect(page.locator("#screen-quote")).toBeVisible();
    await expect(page.locator('[data-role="price"]')).toHaveText("$380.00");

    // The old #/new address opens the same screen.
    await page.evaluate(() => (window.location.hash = "#/new"));
    await expect(page).toHaveURL(/#\/details$/);
    await expect(page.locator("#quote-address")).toHaveValue("4 Draft Ct");
  });

  test("Cancel with unsaved changes asks before discarding", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "5 Cancel Pl", dims: ROOM });
    await page.locator("#screen-quote").getByRole("button", { name: "Cancel" }).first().click();
    const dialog = page.locator("#admin-dialog");
    await expect(dialog.locator("h2")).toHaveText("Discard unsaved changes?");
    await expect(dialog).toContainText("the quote for 5 Cancel Pl");
    await answerDialog(page, "Cancel");
    await expect(page.locator("#screen-quote")).toBeVisible();

    await page.locator("#screen-quote").getByRole("button", { name: "Cancel" }).first().click();
    await answerDialog(page, "Discard changes");
    await expect(page.locator("#screen-dashboard")).toBeVisible();
    expect(await quotesInStorage(page)).toHaveLength(0);
    await expect(page.locator("#draft-banner")).toBeHidden();
  });

  test("the 'Fix the highlighted answers' message counts down and goes once all are fixed", async ({ page }) => {
    await loginAdmin(page);
    await page.click("#create-quote-btn");
    await page.click("#save-quote-btn");
    const summary = page.locator("#quote-error");
    await expect(summary).toHaveText("Fix the 5 highlighted answers before saving.");
    await page.fill("#quote-address", "14 Fixed Ln");
    await expect(summary).toHaveText("Fix the 4 highlighted answers before saving.");
    for (const [k, v] of Object.entries(FLOORING_ONLY)) {
      await chooseAdmin(
        page,
        { demolition: "(demolition)", floorFinish: "New floor?", walls: "Walls?", paintCeiling: "Paint the ceiling?" }[
          k
        ],
        v,
      );
    }
    // Every answer is fixed: the message has gone before Save is pressed again.
    await expect(summary).toBeHidden();
    await page.click("#save-quote-btn");
    // Choosing flooring needs the room size: a new, accurate count.
    await expect(summary).toHaveText("Fix the 2 highlighted answers before saving.");
    await page.fill('input[name="Bathroom_Width_Ft"]', "5");
    await page.fill('input[name="Bathroom_Length_Ft"]', "8");
    await expect(summary).toBeHidden();
  });

  test("saving needs every work question answered and valid numbers", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "6 Check Way", counts: { Toilet_Quantity: "2.5" } });
    await chooseAdmin(page, "(demolition)", "Yes");
    await page.click("#save-quote-btn");
    await expect(page.locator("#quote-error")).toBeVisible();
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

  test("a quote with no work chosen is refused, not saved at $0.00", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "7 Nothing St",
      scope: { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" },
    });
    await page.click("#save-quote-btn");
    const summary = page.locator("#quote-error");
    await expect(summary).toHaveText(
      "Nothing to price yet: choose some work, or enter at least one fixture, plumbing surcharge or electrical point, before saving.",
    );
    expect(await quotesInStorage(page)).toHaveLength(0);
    // An electrical point is work: the message goes and the quote saves.
    await page.fill('input[name="Electrical_Points"]', "1");
    await expect(summary).toBeHidden();
    await page.click("#save-quote-btn");
    await expect(page.locator(".quote-card", { hasText: "7 Nothing St" })).toContainText("$100.00");
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
    await expect(page.locator("#quote-error")).toContainText("Couldn't save this quote in this browser");
    await expect(page.locator("#admin-alert")).toBeVisible();
    await expect(page.locator("#screen-quote")).toBeVisible();
    await expect(page.locator('input[name="Bathroom_Width_Ft"]')).toHaveValue("5");
    await expect(page.locator("#save-quote-btn")).toBeEnabled();
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

test.describe("admin: nothing unsaved is lost", () => {
  test("two tabs editing different quotes never discard each other's changes", async ({ page, context }) => {
    await loginAdmin(page);
    for (const address of ["1 First St", "2 Second St"]) {
      await fillAdminQuote(page, { address, dims: ROOM, scope: FLOORING_ONLY });
      await page.click("#save-quote-btn");
      await expect(page.locator(".quote-card", { hasText: address })).toBeVisible();
    }
    // Tab 1 edits quote A, tab 2 edits quote B; neither is saved.
    await page.locator(".quote-card", { hasText: "1 First St" }).getByRole("button", { name: "View / Edit" }).click();
    await page.fill('input[name="Cabinet_Quantity"]', "2");
    const other = await context.newPage();
    await loginAdmin(other);
    await expect(other.locator("#draft-banner-text")).toHaveText(
      "You have unsaved changes to the quote for 1 First St.",
    );
    // Opening B doesn't ask about A, and doesn't throw A away.
    await other.locator(".quote-card", { hasText: "2 Second St" }).getByRole("button", { name: "View / Edit" }).click();
    await expect(other.locator("#admin-dialog")).toBeHidden();
    await expect(other.locator("#quote-address")).toHaveValue("2 Second St");
    await other.fill('input[name="Cabinet_Quantity"]', "5");

    // Reloading tab 1 keeps A's edits; reloading tab 2 keeps B's.
    await page.reload();
    await expect(page.locator("#quote-address")).toHaveValue("1 First St");
    await expect(page.locator('input[name="Cabinet_Quantity"]')).toHaveValue("2");
    await other.reload();
    await expect(other.locator("#quote-address")).toHaveValue("2 Second St");
    await expect(other.locator('input[name="Cabinet_Quantity"]')).toHaveValue("5");

    // A third tab lists both, each with its own Resume.
    const third = await context.newPage();
    await loginAdmin(third);
    await expect(third.locator("#draft-banner-text")).toHaveText("You have unsaved changes to 2 quotes.");
    await third.getByRole("button", { name: "Resume the quote for 2 Second St" }).click();
    await expect(third.locator('input[name="Cabinet_Quantity"]')).toHaveValue("5");

    // Saving A in tab 1 leaves B's draft alone.
    await page.click("#save-quote-btn");
    await expect(page.locator(".quote-card", { hasText: "1 First St" })).toContainText("Total $320.00");
    await expect(page.locator("#draft-banner-text")).toHaveText(
      "You have unsaved changes to the quote for 2 Second St.",
    );
  });

  test("Create New Quote keeps unsaved changes to another quote; Discard asks first", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "3 Draft Rd", dims: ROOM });
    await page.goto("/about.html");
    await page.goto("/admin/#/dashboard");
    await expect(page.locator("#draft-banner")).toBeVisible();
    await page.click("#create-quote-btn");
    await expect(page.locator("#admin-dialog")).toBeHidden();
    await expect(page.locator("#quote-address")).toHaveValue("");
    await page.locator("#screen-quote").getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.locator("#draft-banner-text")).toHaveText(
      "You have unsaved changes to the quote for 3 Draft Rd.",
    );

    await page.getByRole("button", { name: "Discard unsaved changes to the quote for 3 Draft Rd" }).click();
    await answerDialog(page, "Cancel");
    await expect(page.locator("#draft-banner")).toBeVisible();
    await page.getByRole("button", { name: "Discard unsaved changes to the quote for 3 Draft Rd" }).click();
    await answerDialog(page, "Discard changes");
    await expect(page.locator("#draft-banner")).toBeHidden();
  });

  test("an unsaved quote kept by the previous version of the tool is still offered", async ({ page }) => {
    await page.goto("/admin/");
    await page.evaluate(() => {
      const values = { Cabinet_Quantity: "4" };
      const baseline = JSON.stringify({
        address: "",
        customer: { name: "", phone: "", email: "" },
        values: {},
        scope: {},
      });
      localStorage.setItem(
        "pr_quote_draft",
        JSON.stringify({
          id: "q_1_old",
          isNew: true,
          address: "9 Old Draft Ave",
          customer: {},
          values,
          scope: {},
          baseline,
        }),
      );
    });
    await loginAdmin(page);
    await expect(page.locator("#draft-banner-text")).toHaveText(
      "You have unsaved changes to the quote for 9 Old Draft Ave.",
    );
    await page.getByRole("button", { name: "Resume the quote for 9 Old Draft Ave" }).click();
    await expect(page.locator('input[name="Cabinet_Quantity"]')).toHaveValue("4");
    expect(await page.evaluate(() => localStorage.getItem("pr_quote_draft"))).toBeNull();
  });

  test("leaving Business Prices with a changed price asks first", async ({ page }) => {
    await loginAdmin(page);
    await page.click("#open-rates-btn");
    await page.fill("#rate-Toilet_Price", "250");
    await page.locator("#screen-rates").getByRole("button", { name: "Cancel" }).first().click();
    const dialog = page.locator("#admin-dialog");
    await expect(dialog.locator("h2")).toHaveText("Discard price changes?");
    await answerDialog(page, "Cancel");
    await expect(page.locator("#screen-rates")).toBeVisible();
    await expect(page.locator("#rate-Toilet_Price")).toHaveValue("250");
    // The browser's Back button asks too.
    await page.goBack();
    await answerDialog(page, "Discard changes");
    await expect(page.locator("#screen-dashboard")).toBeVisible();
    await page.click("#open-rates-btn");
    await expect(page.locator("#rate-Toilet_Price")).toHaveValue("200");
    // No changes: leaves straight away.
    await page.locator("#screen-rates").getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.locator("#screen-dashboard")).toBeVisible();
  });
});

test.describe("admin: customer details", () => {
  test("name, phone and email are saved, shown, searchable, on the PDF and survive export/import", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "20 Customer Ln",
      customer: { name: "Jamie Example", phone: "(801) 555-0199", email: "jamie@example.com" },
      dims: ROOM,
      scope: FLOORING_ONLY,
    });
    await page.click("#save-quote-btn");
    const card = page.locator(".quote-card", { hasText: "20 Customer Ln" });
    await expect(card.locator(".quote-card-customer")).toHaveText("Jamie Example · (801) 555-0199 · jamie@example.com");

    for (const term of ["jamie", "801555", "example.com"]) {
      await page.fill("#quote-filter", term);
      await expect(page.locator(".quote-card")).toHaveCount(1);
    }
    await page.fill("#quote-filter", "nobody");
    await expect(page.locator(".quote-card")).toHaveCount(0);
    await page.fill("#quote-filter", "");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    expect(fs.readFileSync(await download.path(), "latin1")).toContain("Prepared for: Jamie Example, 20 Customer Ln");

    const [exported] = await Promise.all([page.waitForEvent("download"), page.click("#export-quotes-btn")]);
    const file = await exported.path();
    expect(JSON.parse(fs.readFileSync(file, "utf8")).quotes[0].customer.name).toBe("Jamie Example");
    await page.evaluate(() => localStorage.setItem("pr_quotes", "[]"));
    await page.reload();
    await page.setInputFiles("#import-quotes-input", file);
    await expect(page.locator(".quote-card-customer")).toHaveText("Jamie Example · (801) 555-0199 · jamie@example.com");

    await page.getByRole("button", { name: "View / Edit" }).click();
    await expect(page.locator("#quote-customer-name")).toHaveValue("Jamie Example");
  });

  test("customer details are optional but checked when given; the address is required", async ({ page }) => {
    await loginAdmin(page);
    await fillAdminQuote(page, { address: "", dims: ROOM, scope: FLOORING_ONLY });
    await page.fill("#quote-customer-phone", "12");
    await page.fill("#quote-customer-email", "nope");
    await page.click("#save-quote-btn");
    await expect(page.locator("#quote-address-error")).toHaveText("Enter the property address.");
    await expect(page.locator("#quote-address")).toBeFocused();
    await expect(page.locator("#quote-customer-phone-error")).toContainText("10 to 15 digits");
    await expect(page.locator("#quote-customer-email-error")).toContainText("name@example.com");
    expect(await quotesInStorage(page)).toHaveLength(0);
    await page.fill("#quote-address", "21 Plain St");
    await page.fill("#quote-customer-phone", "");
    await page.fill("#quote-customer-email", "");
    await page.click("#save-quote-btn");
    await expect(page.locator(".quote-card", { hasText: "21 Plain St" })).toBeVisible();
    await expect(page.locator(".quote-card-customer")).toHaveCount(0);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    expect(fs.readFileSync(await download.path(), "latin1")).toContain("Prepared for: 21 Plain St");
  });
});

test.describe("admin: messages and retention", () => {
  test("the saved message sits above the list, never over a card button, and can be dismissed", async ({ page }) => {
    await loginAdmin(page);
    const long = "30 " + "Very Long Street Name ".repeat(9).trim();
    expect(long.length).toBeGreaterThanOrEqual(200);
    for (const address of ["31 Other Rd", long]) {
      await fillAdminQuote(page, { address, dims: ROOM, scope: FLOORING_ONLY });
      await page.click("#save-quote-btn");
    }
    const toastBox = page.locator("#admin-toast-box");
    await expect(page.locator("#admin-toast")).toContainText("saved.");
    const problems = await page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, right: r.right };
      };
      const t = box(document.getElementById("admin-toast-box"));
      const found = [];
      document.querySelectorAll(".quote-card button").forEach((button) => {
        const b = box(button);
        if (b.left < t.right && b.right > t.left && b.top < t.bottom && b.bottom > t.top) {
          found.push("overlaps: " + button.textContent);
        }
        // Clickable: nothing else sits on top of the button's centre.
        button.scrollIntoView({ block: "center" });
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !button.contains(hit)) found.push("covered: " + button.textContent);
      });
      return found;
    });
    expect(problems).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Dismiss message" }).click();
    await expect(toastBox).toBeHidden();
  });

  test("quotes marked as booked jobs are kept by the retention clean-up", async ({ page }) => {
    await page.goto("/admin/");
    await page.evaluate(() => {
      const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const quote = (id, address) => ({
        id,
        address,
        data: { bathroom: { calcVersion: 2, jobValues: { Cabinet_Quantity: 1 }, scope: {}, totalPrice: 60 } },
        createdAt: old,
        updatedAt: old,
      });
      localStorage.setItem(
        "pr_quotes",
        JSON.stringify([quote("q_a", "40 Old Lane"), quote("q_b", "41 Old Lane"), quote("q_c", "42 Won Lane")]),
      );
    });
    await loginAdmin(page);
    await expect(page.locator("#retention-bar")).toContainText("3 quotes have not been updated in over 30 days");
    // Due: the line is marked and open, with the actions on show.
    await expect(page.locator("#retention-bar")).toHaveAttribute("data-retention", "due");
    await expect(page.locator("#retention-summary")).toHaveText("3 quotes past the 30-day retention period.");
    await expect(page.getByRole("button", { name: "Clean-up Details" })).toHaveAttribute("aria-expanded", "true");
    const won = page.locator(".quote-card", { hasText: "42 Won Lane" });
    await won.getByRole("button", { name: "Mark Job Booked" }).click();
    await expect(won).toContainText("Job booked");
    await expect(won).not.toContainText("Past retention period");
    await expect(page.locator("#retention-bar")).toContainText("2 quotes have not been updated in over 30 days");

    await page.getByRole("button", { name: "Delete Old Enquiries" }).click();
    await answerDialog(page, "Delete 2 quotes");
    await expect(page.locator(".quote-card")).toHaveCount(1);
    await expect(page.locator(".quote-card")).toContainText("42 Won Lane");
    await expect(page.locator("#retention-bar")).toContainText("No quotes in this browser are past");
    const left = await quotesInStorage(page);
    expect(left.map((q) => [q.id, q.ledToWork])).toEqual([["q_c", true]]);

    await won.getByRole("button", { name: "Undo Job Booked" }).click();
    await expect(won).toContainText("Past retention period");

    await page.getByRole("button", { name: "Log This Month's Clean-Up" }).click();
    await expect(page.locator("#admin-dialog")).toContainText("old backup files");
    await answerDialog(page, "Log clean-up");
    await expect(page.locator("#retention-bar")).toContainText("Last monthly clean-up logged in this browser: ");
    await expect(page.locator("#retention-bar")).not.toContainText("logged in this browser: none");
  });

  test("the monthly clean-up line turns prominent once the last logged clean-up is over a month old", async ({
    page,
  }) => {
    await page.goto("/admin/");
    await page.evaluate(() => {
      const now = new Date().toISOString();
      const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(
        "pr_quotes",
        JSON.stringify([
          {
            id: "q_new",
            address: "7 Fresh Lane",
            data: { bathroom: { calcVersion: 2, jobValues: { Cabinet_Quantity: 1 }, scope: {}, totalPrice: 60 } },
            createdAt: now,
            updatedAt: now,
          },
        ]),
      );
      localStorage.setItem("pr_retention_log", JSON.stringify([{ date: longAgo, type: "monthly-clean-up" }]));
    });
    await loginAdmin(page);
    const bar = page.locator("#retention-bar");
    await expect(bar).toHaveAttribute("data-retention", "due");
    await expect(bar).toHaveClass(/is-due/);
    await expect(page.locator("#retention-summary")).toContainText("Monthly clean-up due (last logged");
    await page.getByRole("button", { name: "Log This Month's Clean-Up" }).click();
    await answerDialog(page, "Log clean-up");
    await expect(bar).toHaveAttribute("data-retention", "ok");
    await expect(page.locator("#retention-summary")).toContainText("Nothing past 30 days; last clean-up logged");
    await expect(page.getByRole("button", { name: "Log This Month's Clean-Up" })).toBeHidden();
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
