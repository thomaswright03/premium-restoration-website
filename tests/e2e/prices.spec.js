"use strict";

// The owner changes a published price in site-config.json ("prices") only;
// the home page, FAQ, Terms, chat, estimate and admin quotes all follow.

const { test, expect } = require("@playwright/test");
const { useConfig, sendChat, startEstimate, answerScope, fillGroup, loginAdmin, fillAdminQuote } = require("./helpers");

const FLOORING_ONLY_CHAT = { demolition: "No", floorFinish: "Other flooring", walls: "Neither", paintCeiling: "No" };
const FLOORING_ONLY = FLOORING_ONLY_CHAT;

test.describe("published prices come from site-config.json", () => {
  test("changing the cabinet price in the settings changes it everywhere", async ({ page }) => {
    await useConfig(page, { prices: { cabinetEach: 75 } });

    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await expect(page.locator("#pricing")).toContainText("$75 per Cabinet");
    for (const file of ["faq.html", "terms.html"]) {
      await page.goto("/" + file);
      await expect(page.locator('[data-price="Cabinet_Price"]').first()).toHaveText("$75");
    }

    await page.goto("/index.html");
    await sendChat(page, "cabinet price?");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("$75 per cabinet");

    await startEstimate(page);
    await answerScope(page, FLOORING_ONLY_CHAT);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    const card = page.getByTestId("estimate-card");
    await expect(card).toContainText("3 units × $75.00");
    await expect(card.locator(".ai-chat-estimate-total-value")).toHaveText("$425.00");

    // Admin quotes use the same published price (and the same calculation).
    await loginAdmin(page);
    await fillAdminQuote(page, {
      address: "1 New Price Rd",
      dims: { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 },
      scope: FLOORING_ONLY,
      counts: { Cabinet_Quantity: 3 },
    });
    await expect(page.locator(".calc-row", { hasText: "Cabinets" })).toContainText("$75 each");
    await expect(page.locator('[data-role="price"]')).toHaveText("$425.00");
  });

  test("invalid prices in the settings switch the estimator off and pause quoting, with a clear message", async ({
    page,
  }) => {
    const problems = [];
    page.on("console", (m) => m.type() === "warning" && problems.push(m.text()));
    await useConfig(page, { priceEstimator: { enabled: true }, prices: { cabinetEach: "$75" } });
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await expect(page.locator("#ai-chat-quote-starter-row")).toBeHidden();
    await sendChat(page, "cabinet price?");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("Call (385) 356-8733");
    expect(problems.join(" ")).toContain("cabinetEach must be a number");

    await loginAdmin(page);
    await expect(page.locator("#admin-alert")).toContainText("prices couldn't be loaded from site-config.json");
    await page.click("#create-quote-btn");
    await expect(page.locator("#screen-dashboard")).toBeVisible();
    // Backups still work.
    await expect(page.locator("#backup-panel")).toBeVisible();
  });
});
