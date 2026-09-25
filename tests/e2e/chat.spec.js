"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { useConfig, sendChat, startEstimate, answerScope, fillGroup, skipRoomInteractionSteps } = require("./helpers");

const NOTHING_BUT_FLOORING = { demolition: "No", floorFinish: "Other flooring", walls: "Neither", paintCeiling: "No" };

test.describe("chat estimate", () => {
  test("progress bar is hidden until an estimate starts and never sits under the close button", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#ai-chat-progress")).toBeHidden();
    await expect(page.locator("#ai-chat-toolbar")).toBeHidden();

    await page.click("#ai-chat-quote-starter");
    const progress = page.locator("#ai-chat-progress");
    await expect(progress).toBeVisible();
    await expect(page.locator("#ai-chat-close")).toBeVisible();
    const label = await page.locator("#ai-chat-progress-label").boundingBox();
    const close = await page.locator("#ai-chat-close").boundingBox();
    expect(label.x + label.width).toBeLessThanOrEqual(close.x);
    const width = await progress.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(760);

    // The whole suggestion row (avatar included) goes away once used.
    await expect(page.locator("#ai-chat-quote-starter-row")).toHaveCount(0);
  });

  test("5 x 8 x 8 room, other flooring and 3 cabinets comes to $380.00, and the PDF exports", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    await skipRoomInteractionSteps(page);

    const card = page.getByTestId("estimate-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".ai-chat-estimate-total-value")).toHaveText("$380.00");
    await expect(card).toContainText("Flooring");
    await expect(card).toContainText("40 sq ft × $5.00");
    await expect(card).toContainText("3 units × $60.00");
    // Short line above the numbers; the full disclaimer below the total.
    await expect(card.locator(".ai-chat-estimate-lede")).toHaveText(/Rough, non-binding labor estimate/);
    await expect(card.locator(".ai-chat-estimate-disclaimer")).toContainText("It is not a quote, offer, or contract");
    await expect(card).toContainText("Plumbing & electrical work");
    await expect(page.locator("#ai-chat-progress")).toBeHidden({ timeout: 3000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const pdf = fs.readFileSync(await download.path(), "latin1");
    expect(pdf.startsWith("%PDF")).toBe(true);
    expect(pdf).toContain("Estimated Labor Total");
    expect(pdf).toContain("$380.00");
    expect(pdf).toContain("It is not a quote, offer, or contract");
    expect(pdf).toMatch(/Page 1 of 1/);
    expect(pdf).not.toMatch(/\[[A-Z][A-Z0-9 #]{2,}\]/);
  });

  test("a long estimate with everything chosen spills onto more pages, each with a footer", async ({ page }) => {
    // Every field gets filled here, each firing a live 3D-room rebuild — the
    // realistic toilet's heavier PBR materials/shadows make this the single
    // slowest path in the suite, especially under this environment's
    // software-rendered (no real GPU) WebGL.
    test.setTimeout(60000);
    await startEstimate(page);
    await answerScope(page, {
      demolition: "Yes",
      floorFinish: "Tile",
      walls: "Tile (full height)",
      paintCeiling: "Yes",
    });
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 9, Bathroom_Length_Ft: 12, Bathroom_Height_Ft: 9 });
    const counts = {};
    for (const key of [
      "Toilet_Quantity",
      "Sink_Quantity",
      "Bathtub_Quantity",
      "Shower_Quantity",
      "Shower_Door_Quantity",
      "Door_Quantity",
      "Vanity_Quantity",
      "Cabinet_Quantity",
      "Mirror_Quantity",
      "Mirror_Huge_Quantity",
      "Shower_Shelf_Quantity",
    ]) {
      counts[key] = 2;
    }
    await fillGroup(page, "fixtures", counts);
    await skipRoomInteractionSteps(page);
    const card = page.getByTestId("estimate-card");
    await expect(card.locator(".ai-chat-estimate-total-label")).toHaveText("Estimated Labor Total, before plumbing");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const pdf = fs.readFileSync(await download.path(), "latin1");
    const pages = Number(/Page 1 of (\d+)/.exec(pdf)[1]);
    expect(pages).toBeGreaterThan(1);
    for (let i = 1; i <= pages; i++) expect(pdf).toContain(`Page ${i} of ${pages}`);
    expect((pdf.match(/\(Generated /g) || []).length).toBe(pages);
  });

  test("PDF export shows a loading state, an inline error with Retry, and recovers", async ({ page }) => {
    let failNext = true;
    await page.route("**/js/vendor/jspdf.umd.min.js", async (route) => {
      if (failNext) {
        failNext = false;
        return route.abort();
      }
      await new Promise((r) => setTimeout(r, 300));
      return route.continue();
    });
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      d.dismiss();
    });
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" });
    await fillGroup(page, "fixtures", { Vanity_Quantity: 1 });
    await skipRoomInteractionSteps(page);
    const card = page.getByTestId("estimate-card");
    await card.getByRole("button", { name: "Export as PDF" }).click();
    await expect(card.locator(".ai-chat-estimate-pdf-status")).toContainText("couldn't be prepared");
    const retry = card.getByRole("button", { name: "Retry PDF" });
    await expect(retry).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await retry.click();
    await expect(card.getByRole("button", { name: "Preparing PDF…" })).toBeDisabled();
    await downloadPromise;
    expect(dialogs).toBe(0);
  });

  test("chosen area work needs valid dimensions: no estimate until they are fixed", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, { demolition: "Yes", floorFinish: "None", walls: "Neither", paintCeiling: "No" });
    const dims = page.locator('form[data-group="dimensions"]');
    await dims.locator(".ai-chat-group-continue").click();
    await expect(dims.locator(".ai-chat-field-error").first()).toContainText("Enter the width in feet");
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);

    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("1e200");
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("8");
    await dims.locator(".ai-chat-group-continue").click();
    await expect(dims.locator(".ai-chat-field-error").first()).toContainText(
      "Width must be more than 0 and no more than 50 ft",
    );

    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("5");
    await dims.locator(".ai-chat-group-continue").click();
    const fixtures = page.locator('form[data-group="fixtures"]');
    await fixtures.locator('input[name="Toilet_Quantity"]').fill("2.5");
    await fixtures.locator(".ai-chat-group-continue").click();
    await expect(fixtures).toContainText("Enter a whole number from 0 to 20");
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);

    await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
    await fixtures.locator(".ai-chat-group-continue").click();
    await skipRoomInteractionSteps(page);
    const card = page.getByTestId("estimate-card");
    await expect(card).toContainText("Demolition");
    await expect(card.locator(".ai-chat-estimate-total-value")).toHaveText("$1,700.00");
  });

  test("every work question must be answered", async ({ page }) => {
    await startEstimate(page);
    const form = page.locator('form[data-group="scope"]');
    await form.getByRole("button", { name: /Continue/ }).click();
    await expect(form.locator(".ai-chat-field-error:visible")).toHaveCount(4);
  });

  test("Contact Us About This carries the estimate into the contact form and the email", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    await skipRoomInteractionSteps(page);
    await page.getByRole("link", { name: "Contact Us About This →" }).click();
    await expect(page).toHaveURL(/contact\.html\?from=estimate/);
    const message = page.locator("#message");
    await expect(message).toHaveValue(/5 ft wide × 8 ft long/);
    await expect(message).toHaveValue(/Cabinets 3/);
    await expect(message).toHaveValue(/\$380\.00/);
    await expect(page.locator("#estimate-prefill-note")).toBeVisible();

    await page.fill("#name", "Test Person");
    await page.fill("#phone", "(385) 555-0100");
    await page.fill("#email", "test@example.com");
    await page.click("#lead-submit");
    const href = await page.locator("#mailto-link").getAttribute("href");
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body).toContain("Project details:\nMy bathroom estimate from your website:");
    expect(body).toContain("$380.00");
  });

  test("scripted answers use whole words and offer the estimate", async ({ page }) => {
    await page.goto("/index.html");
    await sendChat(page, "how much for tile?");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("Tile is $4 per sq ft");
    await expect(page.locator(".ai-chat-suggestion").last()).toBeVisible();
    await sendChat(page, "Do you do fireplaces?");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("only take on bathroom");
  });
});

test.describe("estimator switch (site-config.json priceEstimator.enabled)", () => {
  test("off: no estimate button, and price questions get the call-us reply", async ({ page }) => {
    await useConfig(page, { priceEstimator: { enabled: false } });
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await expect(page.locator("#ai-chat-quote-starter")).toBeHidden();
    await sendChat(page, "bathroom quote");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toHaveText(
      "Call (385) 356-8733 or use the Contact page for a price.",
    );
    await expect(page.locator('form[data-group="scope"]')).toHaveCount(0);
    await expect(page.locator(".ai-chat-suggestion:visible")).toHaveCount(0);
  });

  test("on: the estimate button and the 'bathroom quote' trigger work", async ({ page }) => {
    await useConfig(page, { priceEstimator: { enabled: true } });
    await page.goto("/index.html");
    await expect(page.locator("#ai-chat-quote-starter")).toBeVisible();
    await sendChat(page, "bathroom quote");
    await expect(page.locator('form[data-group="scope"]')).toBeVisible();
  });

  test("if the settings file can't be loaded, the estimator stays off", async ({ page }) => {
    await page.route("**/site-config.json", (route) => route.fulfill({ status: 500, body: "" }));
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "defaults");
    await expect(page.locator("#ai-chat-quote-starter")).toBeHidden();
  });
});
