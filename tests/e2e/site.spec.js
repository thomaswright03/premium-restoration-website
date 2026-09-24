"use strict";

const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const Pricing = require("../../js/bathroom-pricing.js");
const { useConfig } = require("./helpers");

const PUBLIC_PAGES = [
  "index.html",
  "about.html",
  "faq.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "gallery.html",
  "404.html",
];
const PLACEHOLDER = /\[[A-Z][A-Z0-9 #/-]*[A-Z#]\]/;

test.describe("every public page", () => {
  for (const file of PUBLIC_PAGES) {
    test(`${file}: no placeholders, no sideways scroll, no console errors or missing files`, async ({ page }) => {
      const problems = [];
      page.on("pageerror", (e) => problems.push("page error: " + e.message));
      page.on("console", (m) => m.type() === "error" && problems.push("console: " + m.text()));
      page.on("response", (r) => r.status() >= 400 && problems.push(r.status() + " " + r.url()));
      for (const width of [375, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/" + file);
        await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
        const text = await page.locator("body").innerText();
        expect(text).not.toMatch(PLACEHOLDER);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
      expect(problems).toEqual([]);
    });
  }

  test("filled-in owner details appear, and blank ones leave no gaps or brackets", async ({ page }) => {
    await useConfig(page, {
      owner: { legalName: "Test Owner Name", contactAddress: "1 Example Street" },
      privacy: { responsePeriod: "30 days" },
    });
    await page.goto("/privacy.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    const text = await page.locator("body").innerText();
    expect(text).toContain("its owner, Test Owner Name (“we”, “us”)");
    expect(text).toContain("Our contact address is 1 Example Street.");
    expect(text).toContain("we will respond within 30 days");
    expect(text).toContain("Operated by Test Owner Name, an individual");

    await page.unroute("**/site-config.json");
    await page.goto("/privacy.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    const plain = await page.locator("body").innerText();
    expect(plain).toContain("run by one individual, its owner (“we”, “us”)");
    expect(plain).toContain("confirming details of your enquiry). If we have to keep");
    expect(plain).toContain("Operated by an individual");
  });

  test("published prices in page text match DEFAULT_PRICES", async ({ page }) => {
    const cabinet = Pricing.shortMoney(Pricing.DEFAULT_PRICES.Cabinet_Price);
    const flooring = Pricing.shortMoney(Pricing.DEFAULT_PRICES.Floor_Price_Per_SqFt);
    await page.goto("/index.html");
    await expect(page.locator("#pricing")).toContainText(`${cabinet} per Cabinet`);
    await expect(page.locator("#pricing")).toContainText(`${flooring} per Sq Ft of Flooring`);
    for (const file of ["index.html", "faq.html", "terms.html"]) {
      await page.goto("/" + file);
      const prices = await page
        .locator("[data-price]")
        .evaluateAll((els) => els.map((e) => [e.dataset.price, e.textContent]));
      expect(prices.length).toBeGreaterThan(0);
      for (const [key, text] of prices) expect(text).toBe(Pricing.shortMoney(Pricing.DEFAULT_PRICES[key]));
    }
    await page.goto("/terms.html");
    await expect(page.locator("main")).toContainText(
      `${cabinet} per cabinet and ${flooring} per sq ft of bathroom flooring`,
    );
  });

  test("no link leads to the empty Our Work page", async ({ page }) => {
    for (const file of PUBLIC_PAGES.filter((f) => f !== "gallery.html")) {
      await page.goto("/" + file);
      await expect(page.locator('a[href*="gallery.html"]')).toHaveCount(0);
    }
  });

  test("unknown URLs get the styled 404 page with Home and Get a Quote", async ({ page }) => {
    const res = await page.goto("/deep/missing/page.html");
    expect(res.status()).toBe(404);
    await expect(page.locator("h1")).toContainText("Not Found");
    await expect(page.locator("main").getByRole("link", { name: "Go to the Home Page" })).toHaveAttribute(
      "href",
      "/index.html",
    );
    await expect(page.locator("main").getByRole("link", { name: "Get a Quote" })).toHaveAttribute(
      "href",
      "/contact.html",
    );
    // Styles load even from a nested path.
    const bg = await page.locator(".site-footer").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("favicon and theme colour are declared, and /favicon.ico exists", async ({ page, request }) => {
    for (const file of PUBLIC_PAGES) {
      await page.goto("/" + file);
      await expect(page.locator('link[rel="icon"][href$="favicon.svg"]')).toHaveCount(1);
      await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    }
    expect((await request.get("/favicon.ico")).status()).toBe(200);
    expect((await request.get("/apple-touch-icon.png")).status()).toBe(200);
  });
});

test.describe("accessibility", () => {
  for (const scheme of ["light", "dark"]) {
    test(`text contrast is at least 4.5:1 on every page (${scheme} theme)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      for (const file of PUBLIC_PAGES) {
        await page.goto("/" + file);
        await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
        const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
        const failures = results.violations.flatMap((v) =>
          v.nodes.map((n) => `${file}: ${n.target} ${n.failureSummary}`),
        );
        expect(failures).toEqual([]);
      }
    });

    test(`chat, estimate card and admin screens meet contrast (${scheme} theme)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto("/index.html");
      await page.click("#ai-chat-quote-starter");
      const form = page.locator('form[data-group="scope"]');
      await form.getByRole("button", { name: /Continue/ }).click(); // show the field errors too
      let results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => n.target + " " + n.failureSummary))).toEqual([]);
      for (const label of ["Remove the existing bathroom first (demolition)?", "Paint the ceiling?"]) {
        await form
          .locator(".ai-chat-group-field", { hasText: label })
          .getByRole("button", { name: "No", exact: true })
          .click();
      }
      await form
        .locator(".ai-chat-group-field", { hasText: "New floor?" })
        .getByRole("button", { name: "None", exact: true })
        .click();
      await form
        .locator(".ai-chat-group-field", { hasText: "Walls?" })
        .getByRole("button", { name: "Neither", exact: true })
        .click();
      await form.getByRole("button", { name: /Continue/ }).click();
      const fixtures = page.locator('form[data-group="fixtures"]');
      await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
      await fixtures.locator(".ai-chat-group-continue").click();
      await expect(page.getByTestId("estimate-card")).toBeVisible();
      results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => n.target + " " + n.failureSummary))).toEqual([]);

      await page.goto("/admin/");
      results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => n.target + " " + n.failureSummary))).toEqual([]);
      await page.fill("#login-password", "templein26)");
      await page.click('button:has-text("Log In")');
      await page.click("#create-quote-btn");
      await page.fill("#quote-customer-email", "not-an-email");
      await page.click("#save-quote-btn"); // show validation messages
      await expect(page.locator("#quote-address-error")).toBeVisible();
      results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => n.target + " " + n.failureSummary))).toEqual([]);
    });
  }

  test("contact page passes an automated accessibility check", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // no scroll-reveal fade in the middle of the check
    await page.goto("/contact.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.target).join(", "))).toEqual([]);
  });

  test("keyboard focus shows a clear ring on links, buttons, inputs, chat choices and FAQ questions", async ({
    page,
  }) => {
    async function ringOf(locator) {
      await locator.focus();
      return locator.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
      });
    }
    await page.goto("/faq.html");
    await page.keyboard.press("Tab"); // switch Chromium to keyboard modality
    for (const locator of [
      page.locator(".faq-question").first(),
      page.locator(".nav-brand"),
      page.locator("footer a").first(),
    ]) {
      const ring = await ringOf(locator);
      expect(ring.style).not.toBe("none");
      expect(ring.width).toBeGreaterThanOrEqual(2);
    }
    await page.goto("/contact.html");
    await page.keyboard.press("Tab");
    const inputRing = await ringOf(page.locator("#name"));
    expect(inputRing.style).not.toBe("none");
    await page.goto("/index.html");
    await page.keyboard.press("Tab");
    await page.click("#ai-chat-quote-starter");
    const choice = page.locator(".ai-chat-choice").first();
    await choice.waitFor();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const choiceRing = await ringOf(choice);
    expect(choiceRing.style).not.toBe("none");
    expect(choiceRing.width).toBeGreaterThanOrEqual(2);
  });

  test("tap targets are at least 44 x 44 px on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/index.html");
    const sizes = await page.evaluate(() =>
      [".nav-toggle", ".ai-chat-send", ".site-footer .footer-col a", ".theme-switch button"].flatMap((sel) =>
        Array.from(document.querySelectorAll(sel)).map((el) => {
          const r = el.getBoundingClientRect();
          return { sel, w: Math.round(r.width), h: Math.round(r.height) };
        }),
      ),
    );
    for (const s of sizes) {
      expect(s.h, s.sel).toBeGreaterThanOrEqual(44);
      if (s.sel !== ".site-footer .footer-col a") expect(s.w, s.sel).toBeGreaterThanOrEqual(44);
    }
    const input = await page.locator("#ai-chat-input").evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(input).toBe(true);
  });
});

test.describe("colour theme", () => {
  test("follows the device on first paint, and a chosen theme persists across pages", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/about.html");
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe("rgb(20, 18, 15)");

    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(page.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/faq.html");
    // Applied before first paint by the inline head script.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(250, 248, 244)");

    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.goto("/admin/");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(20, 18, 15)");

    await page.goto("/index.html");
    await page.getByRole("button", { name: "System", exact: true }).click();
    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(250, 248, 244)");
  });
});
