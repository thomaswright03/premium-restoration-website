"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const {
  useConfig,
  sendChat,
  startEstimate,
  answerScope,
  fillGroup,
  skipRoomInteractionSteps,
  disableMaterials,
} = require("./helpers");

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
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });

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
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, {
      demolition: "Yes",
      floorFinish: "Tile",
      walls: "Tile (full height)",
      paintCeiling: "Yes",
    });
    // Big enough that this whole mix actually fits the room's own clearance
    // rules (verified against js/bathroom-room-layout.js directly) —
    // otherwise the fit-check below (see "the merged fixtures + real-
    // product-pick flow" tests) would rightly block it. Realism isn't the
    // point here; exercising every field (and the PDF's multi-page output)
    // is, so quantities are 2 of everything except the shower-attached trio
    // (a shower's own floor footprint is the biggest single item — 2 of
    // them alongside 2 of everything else doesn't fit even in a very large
    // room, a separate, pre-existing layout-algorithm limitation).
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 15, Bathroom_Length_Ft: 15, Bathroom_Height_Ft: 9 });
    await skipRoomInteractionSteps(page);
    const counts = {};
    for (const key of [
      "Toilet_Quantity",
      "Sink_Quantity",
      "Bathtub_Quantity",
      // Door_Quantity is left out here: with the 3D preview on (as it is in
      // this suite by default), it's derived from entry points confirmed in
      // skipRoomInteractionSteps() above (skipped -> 0), not a fixture
      // field of its own — see "entry points derive the Entry doors count"
      // below for dedicated coverage of that.
      "Vanity_Quantity",
      "Cabinet_Quantity",
      "Mirror_Quantity",
      "Mirror_Huge_Quantity",
    ]) {
      counts[key] = 2;
    }
    counts.Shower_Quantity = 1;
    counts.Shower_Door_Quantity = 1;
    counts.Shower_Shelf_Quantity = 1;
    await fillGroup(page, "fixtures", counts);
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
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Vanity_Quantity: 1 });
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
    await disableMaterials(page);
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
    await skipRoomInteractionSteps(page);
    const fixtures = page.locator('form[data-group="fixtures"]');
    await fixtures.locator('input[name="Toilet_Quantity"]').fill("2.5");
    await fixtures.locator(".ai-chat-group-continue").click();
    await expect(fixtures).toContainText("Enter a whole number from 0 to 20");
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);

    await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
    await fixtures.locator(".ai-chat-group-continue").click();
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
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
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

// The one-continuous-flow feature: fixtures -> real product picks (no
// separate "Pick Your Materials" button/step) -> one combined labor +
// materials card. materialsEstimator is on by default (site-config.json),
// so these run with the real scraped catalog these tests don't override.
test.describe("the merged fixtures + real-product-pick flow", () => {
  const NOTHING_BUT_FIXTURES = { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" };

  test("moves straight from fixtures into product picks with real photos, retints the 3D view, and ends in one combined card", async ({
    page,
  }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FIXTURES);
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1, Shower_Quantity: 1, Shower_Door_Quantity: 1 });

    // The old two-step flow (separate button, separate card) is gone.
    await expect(page.getByRole("button", { name: /Pick Your Materials/ })).toHaveCount(0);

    // No click needed to get from fixtures into the product picks.
    await expect(page.locator(".ai-chat-group-intro", { hasText: "Now let's pick the exact product" })).toBeVisible();
    await page.locator('input[autocomplete="postal-code"]').fill("84101");
    await page.locator(".ai-chat-group-continue").last().click();

    await expect(page.locator(".ai-chat-group-intro", { hasText: "Which toilets" })).toBeVisible();
    const toiletChoice = page.locator(".ai-chat-choice--material").last();
    await expect(toiletChoice.locator(".ai-chat-material-thumb")).toHaveCount(1);
    await toiletChoice.click();
    await page.locator(".ai-chat-group-continue").last().click();

    await expect(page.locator(".ai-chat-group-intro", { hasText: "Which showers" })).toBeVisible();
    await page.locator(".ai-chat-choice--material").last().click();
    await page.locator(".ai-chat-group-continue").last().click();

    // Every real catalog option here is "Matte Black" — picking one proves
    // the 3D proxy's best-effort finish retint (guessFinishColor() in
    // js/materials-pricing.js) actually fires against real product names,
    // not just in isolation.
    await expect(page.locator(".ai-chat-group-intro", { hasText: "Which shower doors" })).toBeVisible();
    const doorChoice = page.locator(".ai-chat-choice--material").last();
    await expect(doorChoice).toContainText(/Matte Black/i);
    await doorChoice.click();
    await page.locator(".ai-chat-group-continue").last().click();

    const card = page.getByTestId("estimate-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Labor Subtotal");
    await expect(card).toContainText("Materials Subtotal");
    await expect(card).toContainText(/Matte Black/i);
    await expect(card.locator(".ai-chat-material-thumb").first()).toBeVisible();
    await expect(card.locator(".ai-chat-estimate-total-label")).toHaveText(
      "Estimated Total (Labor + Materials), before plumbing",
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const pdf = fs.readFileSync(await download.path(), "latin1");
    expect(pdf.startsWith("%PDF")).toBe(true);
    expect(pdf).toContain("Labor Subtotal");
    expect(pdf).toContain("Materials Subtotal");
    // jsPDF escapes parentheses as \( \) inside its own PDF text strings.
    expect(pdf).toContain("Estimated Total \\(Labor + Materials\\), before plumbing");
  });

  test("a scope needing no real products (no fixtures, no tile/paint) still ends in a plain labor-only card", async ({
    page,
  }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FIXTURES);
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", {});

    const card = page.getByTestId("estimate-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".ai-chat-estimate-total-label")).toHaveText("Estimated Labor Total");
    await expect(card).not.toContainText("Materials Subtotal");
  });
});

// Entry doors are no longer their own fixture-count field when the 3D
// preview (and so the entry-points wall-click step) is on — that step is
// the one source of truth for how many entry doors there are. See
// buildGroups()/appendEntryPointsStep() in js/script.js.
test.describe("entry points derive the Entry doors count", () => {
  const NOTHING = { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" };

  test("no manual 'Entry doors' field; placing 2 doored entry points prices 2 entry doors", async ({ page }) => {
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "Tile", walls: "Neither", paintCeiling: "No" });
    // A real room size, not the small DEFAULT_ROOM fallback — enough space
    // to actually nudge the second entry point clear of the first's
    // clearance envelope (same room size the equivalent room-3d.spec.js
    // multi-entry-point test already uses).
    const dims = page.locator('form[data-group="dimensions"]').last();
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("10");
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("8");
    await dims.locator(".ai-chat-group-continue").click();
    await expect(page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last()).toBeVisible();
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click(); // skip plumbing walls

    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator('input[type="text"][inputmode="numeric"]').last().fill("2");
    await page.locator(".ai-chat-group-continue").last().click();

    const canvas = page.locator("#ai-chat-room-3d-canvas-wrap canvas");
    for (let i = 0; i < 2; i++) {
      await expect(page.locator(".ai-chat-group-intro", { hasText: "click its wall" }).last()).toBeVisible();
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
      if (i === 1) {
        const rightBtn = page.locator("button", { hasText: "Move right →" }).last();
        for (let n = 0; n < 6; n++) await rightBtn.click(); // clear of the first point
      }
      // Leave the default "Yes" (has a door) for both.
      await page
        .locator(".ai-chat-group-continue", { hasText: /Confirm/ })
        .last()
        .click();
    }

    const fixtures = page.locator('form[data-group="fixtures"]').last();
    await expect(fixtures).toBeVisible();
    await expect(fixtures.locator('input[name="Door_Quantity"]')).toHaveCount(0);
    await fixtures.locator(".ai-chat-group-continue").click();

    const card = page.getByTestId("estimate-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Entry doors");
    await expect(card).toContainText("2 units × $200.00");
  });

  test("the 3D preview off keeps the manual 'Entry doors' fixture field", async ({ page }) => {
    // A single useConfig() call: each call rebuilds site-config.json fresh
    // from the base and re-registers its own route handler, so a second,
    // separate call (e.g. disableMaterials()) would silently win and drop
    // this override instead of merging with it.
    await useConfig(page, { bathroomVisualizer: { enabled: false }, materialsEstimator: { enabled: false } });
    await startEstimate(page);
    await answerScope(page, NOTHING);
    const fixtures = page.locator('form[data-group="fixtures"]').last();
    await expect(fixtures).toBeVisible();
    await expect(fixtures.locator('input[name="Door_Quantity"]')).toHaveCount(1);
  });
});

// The room's own clearance/overlap/anchor rules (js/bathroom-room-layout.js
// — the same ones the 3D preview's own layout always runs) now block a
// submission that wouldn't actually fit, instead of silently dropping
// whatever didn't fit later. See checkFit() in js/bathroom-room-3d.js.
test.describe("the room's own clearance rules block what won't fit", () => {
  test("a fixture count that can't possibly fit the room is blocked with an inline error", async ({ page }) => {
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "Tile", walls: "Neither", paintCeiling: "No" });
    const dims = page.locator('form[data-group="dimensions"]').last();
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("5");
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("5");
    await dims.locator(".ai-chat-group-continue").click();
    await skipRoomInteractionSteps(page);

    const fixtures = page.locator('form[data-group="fixtures"]').last();
    await fixtures.locator('input[name="Toilet_Quantity"]').fill("10");
    await fixtures.locator(".ai-chat-group-continue").click();

    await expect(fixtures).toBeVisible(); // blocked, not advanced
    await expect(fixtures.locator(".ai-chat-field-error:visible").first()).toContainText("Not enough room");
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);

    // Reducing the count to something that fits gets past it.
    await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
    await fixtures.locator(".ai-chat-group-continue").click();
    await expect(page.getByTestId("estimate-card")).toBeVisible();
  });

  test("an entry point placed where another already is gets blocked with an inline error", async ({ page }) => {
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "Tile", walls: "Neither", paintCeiling: "No" });
    const dims = page.locator('form[data-group="dimensions"]').last();
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("10");
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("8");
    await dims.locator(".ai-chat-group-continue").click();
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator('input[type="text"][inputmode="numeric"]').last().fill("2");
    await page.locator(".ai-chat-group-continue").last().click();

    const canvas = page.locator("#ai-chat-room-3d-canvas-wrap canvas");
    const box = await canvas.boundingBox();

    await expect(page.locator(".ai-chat-group-intro", { hasText: "click its wall" }).last()).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page
      .locator(".ai-chat-group-continue", { hasText: /Confirm/ })
      .last()
      .click();

    // Same spot again, no nudge -> overlaps the first one.
    await expect(page.locator(".ai-chat-group-intro", { hasText: "click its wall" }).last()).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page
      .locator(".ai-chat-group-continue", { hasText: /Confirm/ })
      .last()
      .click();

    await expect(page.locator(".ai-chat-field-error:visible").last()).toContainText("doesn't fit");
    await expect(page.locator('form[data-group="fixtures"]')).toHaveCount(0); // blocked, not advanced

    // Nudge clear and it goes through.
    const rightBtn = page.locator("button", { hasText: "Move right →" }).last();
    for (let n = 0; n < 6; n++) await rightBtn.click();
    await page
      .locator(".ai-chat-group-continue", { hasText: /Confirm/ })
      .last()
      .click();
    await expect(page.locator('form[data-group="fixtures"]')).toBeVisible();
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
