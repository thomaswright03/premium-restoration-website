"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { useConfig, sendChat, startEstimate, answerScope, fillGroup } = require("./helpers");
const { downloadText } = require("./pdf-text");

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

    // While the estimate is worked out, the button that started it reads "Continue my estimate".
    await expect(page.locator(".ai-chat-suggestion")).toHaveCount(1);
    await expect(page.locator("#ai-chat-quote-starter")).toHaveText("Continue my estimate →");
  });

  test("5 x 8 x 8 room, other flooring and 3 cabinets comes to $380.00, and the PDF exports", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
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
    const raw = fs.readFileSync(await download.path(), "latin1");
    expect(raw.startsWith("%PDF")).toBe(true);
    const pdf = await downloadText(download);
    expect(pdf).toContain("Estimated Labor Total");
    expect(pdf).toContain("$380.00");
    expect(pdf).toContain("It is not a quote, offer, or contract");
    expect(pdf).toMatch(/Page 1 of 1/);
    expect(pdf).not.toMatch(/\[[A-Z][A-Z0-9 #]{2,}\]/);
    expect(pdf).not.toContain("\uFFFD");
  });

  test("the estimate PDF has the site's fonts, a reference and issue date, and no validity date unless the owner sets one", async ({
    page,
  }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    const card = page.getByTestId("estimate-card");
    const exportPdf = () =>
      Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Export as PDF" }).click()]).then(
        (r) => r[0],
      );
    const download = await exportPdf();
    const raw = fs.readFileSync(await download.path(), "latin1");
    // The website's typefaces, embedded (only the letters used).
    expect(raw).toContain("/BaseFont /PlayfairDisplay");
    expect(raw).toContain("/BaseFont /Inter");
    expect(raw).toContain("/FontFile2");
    const pdf = await downloadText(download);
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const ref = /Reference (PR-E-(\d{8})-[A-Z2-9]{4})/.exec(pdf);
    expect(ref).not.toBeNull();
    const d = new Date();
    expect(ref[2]).toBe(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`,
    );
    expect(pdf).toContain(`Issued ${today}`);
    expect(download.suggestedFilename()).toBe(`premium-restoration-estimate-${ref[1]}.pdf`);
    // The reference is on every page's footer too.
    expect(pdf).toContain(`${ref[1]} • Page 1 of 1`);
    // No validity period is set in site-config.json, so none is invented.
    expect(pdf).not.toContain("held until");
    expect(pdf).toContain("Prices are current as of the date generated and may change.");

    // The same estimate exported again keeps its reference, and a quote request carries it.
    expect(await downloadText(await exportPdf())).toContain(`Reference ${ref[1]}`);
    await card.getByRole("link", { name: /Get a Quote/ }).click();
    await expect(page.locator("#message")).toHaveValue(new RegExp(`Estimate PDF reference: ${ref[1]}`));
  });

  test("with a validity period set, the PDF says until when its prices are held", async ({ page }) => {
    await useConfig(page, { estimates: { validForDays: 30 } });
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("estimate-card").getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const pdf = await downloadText(download);
    const d = new Date();
    const until = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    expect(pdf).toContain(`Prices held until ${until}`);
    expect(pdf).toContain(
      `Prices are current as of the date generated and are held until ${until}; after that they may change.`,
    );
    expect(pdf).not.toContain("and may change.");
  });

  test("if the PDF fonts can't be fetched, the PDF is still made in standard fonts", async ({ page }) => {
    await page.route("**/fonts/pdf/*.ttf", (route) => route.abort());
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("estimate-card").getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const raw = fs.readFileSync(await download.path(), "latin1");
    expect(raw).not.toContain("/FontFile2");
    const pdf = await downloadText(download);
    expect(pdf).toContain("$380.00");
    expect(pdf).toMatch(/Reference PR-E-\d{8}-[A-Z2-9]{4}/);
  });

  test("a long estimate with everything chosen spills onto more pages, each with a footer", async ({ page }) => {
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
    const card = page.getByTestId("estimate-card");
    await expect(card.locator(".ai-chat-estimate-total-label")).toHaveText("Estimated Labor Total, before plumbing");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Export as PDF" }).click(),
    ]);
    const pdf = await downloadText(download);
    const pages = Number(/Page 1 of (\d+)/.exec(pdf)[1]);
    expect(pages).toBeGreaterThan(1);
    for (let i = 1; i <= pages; i++) expect(pdf).toContain(`Page ${i} of ${pages}`);
    // Every page's footer has the reference and the phone number.
    const ref = /Reference (PR-E-\d{8}-[A-Z2-9]{4})/.exec(pdf)[1];
    expect(pdf.split(`${ref} • Page `).length - 1).toBe(pages);
    expect(pdf.split("(385) 356-8733 • ").length - 1).toBe(pages);
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

    // A value it can't read gets a format message, not a range message.
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("1e200");
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("8");
    await dims.locator(".ai-chat-group-continue").click();
    const widthError = dims.locator(".ai-chat-field-error").first();
    await expect(widthError).toHaveText(
      "Enter the width as a number of feet, e.g. 5.5, or feet and inches, e.g. 5' 6\".",
    );

    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("60");
    await dims.locator(".ai-chat-group-continue").click();
    await expect(widthError).toHaveText("Width must be more than 0 and no more than 50 ft.");

    // Feet and inches are accepted: 5' 6" is 5.5 ft.
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("5'6\"");
    await dims.locator(".ai-chat-group-continue").click();
    const fixtures = page.locator('form[data-group="fixtures"]');
    await fixtures.locator('input[name="Toilet_Quantity"]').fill("2.5");
    await fixtures.locator(".ai-chat-group-continue").click();
    await expect(fixtures).toContainText("Enter a whole number from 0 to 20");
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);

    await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
    await fixtures.locator(".ai-chat-group-continue").click();
    const card = page.getByTestId("estimate-card");
    await expect(card).toContainText("Demolition");
    await expect(card).toContainText("44 sq ft of floor × $37.50");
    await expect(card).toContainText("Floor area: 5.5 × 8 ft = 44 sq ft");
    await expect(card.locator(".ai-chat-estimate-total-value")).toHaveText("$1,850.00");
  });

  for (const size of [
    { width: 375, height: 740 },
    { width: 1280, height: 900 },
  ]) {
    test(`at ${size.width}x${size.height} the finished card shows its heading and total, with focus on the total`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await startEstimate(page);
      // Everything chosen: the longest card there is.
      await answerScope(page, { demolition: "Yes", floorFinish: "Tile", walls: "Paint", paintCeiling: "Yes" });
      await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 9, Bathroom_Length_Ft: 12, Bathroom_Height_Ft: 9 });
      const counts = {};
      for (const key of ["Toilet_Quantity", "Sink_Quantity", "Shower_Quantity", "Vanity_Quantity", "Mirror_Quantity"]) {
        counts[key] = 1;
      }
      await fillGroup(page, "fixtures", counts);
      const card = page.getByTestId("estimate-card");
      const total = card.locator(".ai-chat-estimate-total");
      await expect(total).toBeFocused();
      await expect(total).toHaveAttribute("aria-label", /^Estimated Labor Total, before plumbing: \$[\d,]+\.\d\d$/);
      // Both inside the window and inside the chat's scrolling area, without scrolling.
      const inView = async (locator) => {
        const box = await locator.boundingBox();
        const area = await page.locator("#ai-chat-messages").boundingBox();
        return (
          box.y >= Math.max(0, area.y) - 1 && box.y + box.height <= Math.min(size.height, area.y + area.height) + 1
        );
      };
      expect(await inView(card.locator(".ai-chat-estimate-header h3"))).toBe(true);
      expect(await inView(total)).toBe(true);

      // "Get a Quote →" keeps its arrow on the same line.
      const lines = await card.locator(".ai-chat-estimate-cta").evaluate((a) => {
        const range = document.createRange();
        range.selectNodeContents(a);
        return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      });
      expect(lines).toBe(1);
    });
  }

  test("no work chosen: no $0.00 card, a plain message, and the visitor stays on the step", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" });
    // Nothing needs measuring, so the fixture counts come next.
    await fillGroup(page, "fixtures", { Toilet_Quantity: "0" });
    const form = page.locator('form[data-group="fixtures"]').last();
    await expect(form.locator(".ai-chat-group-error")).toHaveText(
      "There's nothing to price yet: enter how many of at least one item above, or go ← Back and choose some work.",
    );
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);
    await expect(form.locator('input[name="Toilet_Quantity"]')).toBeFocused();
    await expect(form.locator('input[name="Toilet_Quantity"]')).toBeEnabled();
    // Entering one item gives an estimate.
    await fillGroup(page, "fixtures", { Toilet_Quantity: "0", Cabinet_Quantity: "1" });
    await expect(page.getByTestId("estimate-card").locator(".ai-chat-estimate-total-value")).toHaveText("$60.00");
  });

  test("every work question must be answered", async ({ page }) => {
    await startEstimate(page);
    const form = page.locator('form[data-group="scope"]');
    await form.getByRole("button", { name: /Continue/ }).click();
    await expect(form.locator(".ai-chat-field-error:visible")).toHaveCount(4);
  });

  test("Get a Quote on the estimate carries it into the contact form and the email", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    await page.getByRole("link", { name: "Get a Quote →" }).click();
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

  test("questions the website can't answer get an honest 'please ask us', never an invented fact", async ({ page }) => {
    await page.goto("/index.html");
    const last = () => page.locator(".ai-chat-row.bot .ai-chat-text").last();
    await sendChat(page, "Do you have insurance?");
    await expect(last()).toContainText("doesn't give details about insurance");
    await sendChat(page, "Can I pay with credit card?");
    await expect(last()).toContainText("doesn't list the payment methods we accept");
    await sendChat(page, "How much to refinish my bathtub");
    await expect(last()).toContainText("don't have an online price for refinishing");
    await expect(last()).not.toContainText("$350");
    await sendChat(page, "Is the estimate free?");
    await expect(last()).toContainText("doesn't say whether a visit or a written quote is free");
    await expect(page.locator('form[data-group="scope"]')).toHaveCount(0);
    await sendChat(page, "What's the total for a 5x8 bathroom");
    await expect(page.locator('form[data-group="scope"]')).toBeVisible();
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
      "Call (385) 356-8733 or use the Get a Quote page for a price.",
    );
    await expect(page.locator('form[data-group="scope"]')).toHaveCount(0);
    await expect(page.locator(".ai-chat-suggestion:visible")).toHaveCount(0);
    // The page and the greeting say the same: no figures, no invitation to ask prices.
    await expect(page.locator("#pricing")).not.toContainText("$", { useInnerText: true });
    await expect(page.locator("#pricing")).toContainText("Call (385) 356-8733 for the current price.", {
      useInnerText: true,
    });
    await expect(page.locator("#ai-chat-messages .ai-chat-text").first()).toHaveText(
      /Ask me about bathroom work or how to get a quote\./,
      { useInnerText: true },
    );
    await sendChat(page, "how much for a cabinet");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toHaveText(
      "Call (385) 356-8733 or use the Get a Quote page for a price.",
    );
    await page.goto("/faq.html");
    await page.getByRole("button", { name: "How much does it cost?" }).click();
    await expect(page.locator("main")).not.toContainText("$60", { useInnerText: true });
    await expect(page.locator("main")).toContainText("For a price, call us or use the Get a Quote page;", {
      useInnerText: true,
    });
    await page.goto("/terms.html");
    await expect(page.locator("main")).not.toContainText("$60", { useInnerText: true });
    await expect(page.locator("main")).toContainText("Our labor is priced per item; ask us for current prices.", {
      useInnerText: true,
    });
  });

  test("on: the estimate button and the 'bathroom quote' trigger work", async ({ page }) => {
    await useConfig(page, { priceEstimator: { enabled: true } });
    await page.goto("/index.html");
    await expect(page.locator("#ai-chat-quote-starter")).toBeVisible();
    await sendChat(page, "bathroom quote");
    await expect(page.locator('form[data-group="scope"]')).toBeVisible();
  });

  test("if the settings file can't be loaded, the estimator stays off and no page shows a price", async ({ page }) => {
    await page.route("**/site-config.json", (route) => route.fulfill({ status: 500, body: "" }));
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "defaults");
    await expect(page.locator("#ai-chat-quote-starter")).toBeHidden();
    // Page, greeting and chat agree: call for a price.
    await expect(page.locator("#pricing")).not.toContainText("$", { useInnerText: true });
    await expect(page.locator("#pricing")).toContainText("Call (385) 356-8733 for the current price.", {
      useInnerText: true,
    });
    await expect(page.locator("#ai-chat-messages .ai-chat-text").first()).not.toContainText("prices", {
      useInnerText: true,
    });
    await sendChat(page, "how much for a cabinet");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toHaveText(
      "Call (385) 356-8733 or use the Get a Quote page for a price.",
    );
    await page.goto("/faq.html");
    await page.getByRole("button", { name: "How much does it cost?" }).click();
    await expect(page.locator("main")).toContainText("Our labor is priced per item.", { useInnerText: true });
    await expect(page.locator("main")).not.toContainText("$60", { useInnerText: true });
  });

  test("with the quote form in 'please call us' mode, the chat and home page never point to the form", async ({
    page,
  }) => {
    await useConfig(page, { leadForm: { enabled: false } });
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await expect(page.locator(".cta-band")).toContainText("We're not taking requests through the website right now");
    await sendChat(page, "how do I get a quote");
    const last = page.locator(".ai-chat-row.bot .ai-chat-text").last();
    await expect(last).toContainText("For a quote, call (385) 356-8733 or email");
    await expect(last).not.toContainText("Get a Quote page");
    await sendChat(page, "how much for a cabinet");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("$60 per cabinet");
    // A finished estimate offers the phone number instead of the form.
    await page.locator(".ai-chat-suggestion").last().click();
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", {});
    const cta = page.getByTestId("estimate-card").locator(".ai-chat-estimate-cta");
    await expect(cta).toHaveText("Call (385) 356-8733 →");
    await expect(cta).toHaveAttribute("href", "tel:+13853568733");
  });
});

test.describe("chat layout and focus", () => {
  test("on a wide screen, clicking the chat input keeps the chat part of the page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await page.click("#ai-chat-input");
    await expect(page.locator(".ai-chat-section")).not.toHaveClass(/is-fullscreen/);
    await expect(page.locator(".site-header")).toBeVisible();
    await sendChat(page, "What services do you offer?");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("bathroom restorations");
    await expect(page.locator(".ai-chat-section")).not.toHaveClass(/is-fullscreen/);
  });

  test("on a phone the full-screen chat has a title, keeps Tab inside, and Escape returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html");
    await page.click("#ai-chat-input");
    const section = page.locator(".ai-chat-section");
    await expect(section).toHaveClass(/is-fullscreen/);
    await expect(section).toHaveAttribute("role", "dialog");
    await expect(page.locator("#ai-chat-fs-title")).toBeVisible();
    await expect(page.locator("#ai-chat-fs-title")).toHaveText("Automated Assistant");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement.closest(".ai-chat-section"))).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => !!document.activeElement.closest(".ai-chat-section"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(section).not.toHaveClass(/is-fullscreen/);
    await expect(page.locator("#ai-chat-input")).toBeFocused();
    // Closing doesn't reopen it straight away.
    await expect(section).not.toHaveClass(/is-fullscreen/);
  });

  test("an estimate opens full screen on any screen, and closing it returns to the page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/index.html");
    await sendChat(page, "bathroom quote");
    await page.locator('form[data-group="scope"]').waitFor();
    await expect(page.locator(".ai-chat-section")).toHaveClass(/is-fullscreen/);
    await expect(page.locator("#ai-chat-fs-title")).toBeVisible();
    await page.click("#ai-chat-close");
    await expect(page.locator(".ai-chat-section")).not.toHaveClass(/is-fullscreen/);
    // The estimate carries on inline, with focus on its first answer.
    await expect(page.locator('form[data-group="scope"] .ai-chat-choice').first()).toBeFocused();
  });

  test("only the latest estimate button is shown", async ({ page }) => {
    await page.goto("/index.html");
    const questions = ["how much for tile?", "What services do you offer?", "hello", "asdfgh", "cabinet price?"];
    for (const [i, q] of questions.entries()) {
      await sendChat(page, q);
      // Wait for each reply before the next question.
      await expect(page.locator(".ai-chat-row.bot .ai-chat-text")).toHaveCount(i + 2);
    }
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText("$60 per cabinet");
    await expect(page.locator(".ai-chat-suggestion")).toHaveCount(1);
    await page.locator(".ai-chat-suggestion").click();
    await expect(page.locator('form[data-group="scope"]')).toBeVisible();
    await expect(page.locator(".ai-chat-suggestion")).toHaveCount(1);
    await expect(page.locator(".ai-chat-suggestion")).toHaveText("Continue my estimate →");
  });

  test("closing full screen returns focus to the button that opened the estimate", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/index.html");
    const starter = page.locator("#ai-chat-quote-starter");
    await expect(starter).toBeVisible();
    await starter.focus();
    await page.keyboard.press("Enter");
    const section = page.locator(".ai-chat-section");
    await expect(page.locator('form[data-group="scope"]')).toBeVisible();
    await expect(section).toHaveClass(/is-fullscreen/);
    await expect(page.locator('form[data-group="scope"] .ai-chat-choice').first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(section).not.toHaveClass(/is-fullscreen/);
    await expect(starter).toBeFocused();
    await expect(starter).toHaveText("Continue my estimate →");
    // The same button reopens the estimate where it was, and focus comes back to it again.
    await page.keyboard.press("Enter");
    await expect(section).toHaveClass(/is-fullscreen/);
    await expect(page.locator('form[data-group="scope"] .ai-chat-choice').first()).toBeFocused();
    await expect(page.locator('form[data-group="scope"]')).toHaveCount(1);
    await page.click("#ai-chat-close");
    await expect(starter).toBeFocused();
    // Once the estimate is finished the button goes.
    await starter.click();
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", {});
    await expect(page.getByTestId("estimate-card")).toBeVisible();
    await expect(page.locator(".ai-chat-suggestion")).toHaveCount(0);
  });

  test("bathroom questions that name another room get an answer, and emoji get a reply", async ({ page }) => {
    await page.goto("/index.html");
    const last = page.locator(".ai-chat-row.bot .ai-chat-text").last();
    await sendChat(page, "Do you do basement bathrooms?");
    await expect(last).toContainText("We do bathroom restorations");
    await expect(last).not.toContainText("can't help with that");
    await sendChat(page, "quote for my bathroom and kitchen");
    await expect(last).toContainText("We can help with the bathroom");
    await expect(last).toContainText("kitchen part");
    await expect(page.locator(".ai-chat-suggestion")).toHaveCount(1);
    await sendChat(page, "Do you do kitchens?");
    await expect(last).toContainText("can't help with that");
    await sendChat(page, "How long does a tile job take?");
    await expect(last).toContainText("expected timeline");
    await sendChat(page, "Is there a warranty on the tile?");
    await expect(last).toContainText("standard warranty");
    await sendChat(page, "😀👍");
    await expect(last).toContainText("didn't understand");
    await expect(page.locator("#ai-chat-typing-row")).toHaveCount(0);
  });
});

test.describe("estimate Back and reload", () => {
  test("Back returns to earlier steps with answers kept; choosing wall paint then asks for the height", async ({
    page,
  }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    const fixtures = page.locator('form[data-group="fixtures"]');
    await fixtures.locator('input[name="Cabinet_Quantity"]').fill("3");

    await fixtures.getByRole("button", { name: "← Back" }).click();
    const dims = page.locator('form[data-group="dimensions"]');
    await expect(dims).toHaveCount(1);
    await expect(dims.locator('input[name="Bathroom_Width_Ft"]')).toHaveValue("5");
    await expect(page.locator("#ai-chat-progress-label")).toHaveText("33% complete");
    await dims.getByRole("button", { name: "← Back" }).click();

    const scope = page.locator('form[data-group="scope"]');
    await expect(scope).toHaveCount(1);
    await expect(scope.getByRole("button", { name: "Other flooring" })).toHaveAttribute("aria-pressed", "true");
    await expect(scope.getByRole("button", { name: "← Back" })).toHaveCount(0);
    await scope
      .locator(".ai-chat-group-field", { hasText: "Walls?" })
      .getByRole("button", { name: "Paint", exact: true })
      .click();
    await scope.getByRole("button", { name: /Continue/ }).click();

    await expect(dims.locator('input[name="Bathroom_Height_Ft"]')).toBeVisible();
    await expect(dims.locator('input[name="Bathroom_Width_Ft"]')).toHaveValue("5");
    await expect(dims.locator('input[name="Bathroom_Length_Ft"]')).toHaveValue("8");
    await dims.locator('input[name="Bathroom_Height_Ft"]').fill("8");
    await dims.locator(".ai-chat-group-continue").click();
    await expect(fixtures.locator('input[name="Cabinet_Quantity"]')).toHaveValue("3");
    await fixtures.locator(".ai-chat-group-continue").click();
    // $200 flooring + $180 cabinets + 208 sq ft of wall paint at $1.79 = $752.32
    await expect(page.getByTestId("estimate-card").locator(".ai-chat-estimate-total-value")).toHaveText("$752.32");
  });

  test("a reload keeps an estimate in progress, then the finished estimate, in the same tab", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NOTHING_BUT_FLOORING);
    const dims = page.locator('form[data-group="dimensions"]');
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("5");
    await page.reload();
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text", { hasText: "Welcome back" })).toBeVisible();
    await expect(dims.locator('input[name="Bathroom_Width_Ft"]')).toHaveValue("5");
    await expect(page.locator("#ai-chat-progress-label")).toHaveText("33% complete");
    // Picked up quietly: the page isn't taken over on load.
    await expect(page.locator(".ai-chat-section")).not.toHaveClass(/is-fullscreen/);
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("8");
    await dims.locator(".ai-chat-group-continue").click();
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    await expect(page.getByTestId("estimate-card").locator(".ai-chat-estimate-total-value")).toHaveText("$380.00");

    await page.reload();
    const card = page.getByTestId("estimate-card");
    await expect(card.locator(".ai-chat-estimate-total-value")).toHaveText("$380.00");
    await expect(page.locator("#ai-chat-input")).toBeVisible();

    // Cancel forgets it.
    await sendChat(page, "bathroom quote");
    await page.locator('form[data-group="scope"]').getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await expect(page.getByTestId("estimate-card")).toHaveCount(0);
    await expect(page.locator('form[data-group="scope"]')).toHaveCount(0);
  });
});
