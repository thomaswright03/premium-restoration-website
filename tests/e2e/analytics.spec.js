"use strict";

// Visitor counts (js/analytics.js): off by default, switched on in
// site-config.json, no cookies, event names only, and the Privacy Notice
// describes them only when they are on.

const { test, expect } = require("@playwright/test");
const { useConfig, startEstimate, answerScope, fillGroup } = require("./helpers");

const PLAUSIBLE = "https://plausible.io/js/script.js";
const ENDPOINT = "https://forms.example.test/f/abc123";
const FLOORING = { demolition: "No", floorFinish: "Other flooring", walls: "Neither", paintCeiling: "No" };

// Stands in for the provider's script: records the events it is given.
const RECORDER = `
  window.__counted = [];
  var queued = (window.plausible && window.plausible.q) || [];
  window.plausible = function (name) { window.__counted.push(name); };
  queued.forEach(function (args) { window.plausible.apply(null, args); });
`;

async function counted(page) {
  return page.evaluate(() => window.__counted || []);
}

test("off by default: no counting script is loaded and the Privacy Notice says there are no analytics", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => {
    if (/plausible|_vercel\/insights/.test(r.url())) requests.push(r.url());
  });
  await page.goto("/index.html");
  await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
  await page.click("#ai-chat-quote-starter");
  await page.locator('form[data-group="scope"]').waitFor();
  await page.goto("/privacy.html");
  await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
  const text = await page.locator("main").innerText();
  expect(text).toContain("We do not use cookies, analytics, advertising pixels");
  expect(text).not.toContain("counts visits");
  expect(requests).toEqual([]);
});

test.describe("switched on (Plausible)", () => {
  test.beforeEach(async ({ page }) => {
    await useConfig(page, {
      analytics: { enabled: true, provider: "plausible", domain: "example.test" },
      leadForm: { endpoint: ENDPOINT, serviceName: "Formspree" },
    });
    await page.route(PLAUSIBLE, (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: RECORDER }),
    );
  });

  test("counts an estimate started and completed, Contact Us About This, and a sent request", async ({
    page,
    context,
  }) => {
    await startEstimate(page);
    await expect(page.locator('script[src="' + PLAUSIBLE + '"]')).toHaveAttribute("data-domain", "example.test");
    await answerScope(page, FLOORING);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 3 });
    await expect(page.getByTestId("estimate-card")).toBeVisible();
    await expect.poll(() => counted(page)).toEqual(["Estimate started", "Estimate completed"]);

    await page.route(ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }),
    );
    await page.getByRole("link", { name: "Contact Us About This →" }).click();
    await expect.poll(() => counted(page)).toEqual(["Contact Us About This"]);
    await page.fill("#name", "Test Person");
    await page.fill("#phone", "(385) 555-0100");
    await page.fill("#email", "test@example.com");
    await page.click("#lead-submit");
    await expect(page.locator("#form-status")).toContainText("Request sent.");
    await expect.poll(() => counted(page)).toEqual(["Contact Us About This", "Quote request sent"]);
    // Names only: nothing the visitor typed, and no cookies.
    expect(JSON.stringify(await counted(page))).not.toMatch(/Test Person|example\.com|555/);
    expect(await context.cookies()).toEqual([]);
  });

  test("counts a failed request", async ({ page }) => {
    await page.route(ENDPOINT, (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/contact.html");
    await page.fill("#name", "Test Person");
    await page.fill("#phone", "(385) 555-0100");
    await page.fill("#email", "test@example.com");
    await page.click("#lead-submit");
    await expect(page.locator("#form-status")).toContainText("wasn't sent");
    await expect.poll(() => counted(page)).toEqual(["Quote request failed"]);
  });

  test("the Privacy Notice names the service and what is counted", async ({ page }) => {
    await page.goto("/privacy.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    const text = await page.locator("main").innerText();
    expect(text).toContain("We do count visits and a few actions on this website, anonymously");
    expect(text).toContain("Plausible Analytics counts visits to this website");
    expect(text).toContain("It does not use cookies");
    expect(text).toContain("Global Privacy Control signal, this website does not count your visit");
    expect(text).not.toContain("We do not use cookies, analytics, advertising pixels");
  });

  test("nothing is counted when the browser sends Global Privacy Control, or on the admin tool", async ({ page }) => {
    const requests = [];
    page.on("request", (r) => r.url() === PLAUSIBLE && requests.push(r.url()));
    await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await page.click("#ai-chat-quote-starter");
    await page.locator('form[data-group="scope"]').waitFor();
    expect(requests).toEqual([]);
    expect(await counted(page)).toEqual([]);
  });
});

test("the admin tool never loads the counting script", async ({ page }) => {
  await useConfig(page, { analytics: { enabled: true, provider: "plausible" } });
  const requests = [];
  page.on("request", (r) => r.url() === PLAUSIBLE && requests.push(r.url()));
  await page.goto("/admin/");
  await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
  expect(requests).toEqual([]);
});

test("Vercel Web Analytics is loaded from the site itself and sent named events", async ({ page }) => {
  await useConfig(page, { analytics: { enabled: true, provider: "vercel" } });
  await page.route("**/_vercel/insights/script.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: "window.__vercelLoaded = true;",
    }),
  );
  await startEstimate(page);
  await expect.poll(() => page.evaluate(() => window.__vercelLoaded === true)).toBe(true);
  const queued = await page.evaluate(() => (window.vaq || []).map((args) => [args[0], args[1] && args[1].name]));
  expect(queued).toEqual([["event", "Estimate started"]]);
});
