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
  window.__details = [];
  var queued = (window.plausible && window.plausible.q) || [];
  window.plausible = function (name, options) {
    window.__counted.push(name);
    window.__details.push([name, (options && options.props) || null]);
  };
  queued.forEach(function (args) { window.plausible.apply(null, args); });
`;

async function counted(page) {
  return page.evaluate(() => window.__counted || []);
}

// The error reports sent: [event name, details].
async function reports(page) {
  return page.evaluate(() =>
    (window.__details || []).filter(([name]) => name === "Script error" || name === "Settings failed to load"),
  );
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

  test("counts an estimate started and completed, Get a Quote from it, and a sent request", async ({
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
    await page.getByRole("link", { name: "Get a Quote →" }).click();
    await expect.poll(() => counted(page)).toEqual(["Get a Quote from estimate"]);
    await page.fill("#name", "Test Person");
    await page.fill("#phone", "(385) 555-0100");
    await page.fill("#email", "test@example.com");
    await page.click("#lead-submit");
    await expect(page.locator("#form-status")).toContainText("Request sent.");
    await expect.poll(() => counted(page)).toEqual(["Get a Quote from estimate", "Quote request sent"]);
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

// Error reports: off by default; with errorReports.enabled (and counting on)
// a script error, a file that fails to load, or the settings not loading is
// sent through the same provider — where and what kind, never the message.
test.describe("error reports", () => {
  const ON = {
    analytics: { enabled: true, provider: "plausible", domain: "example.test" },
    errorReports: { enabled: true },
  };

  // Serves the home page with extra scripts in its <head>, which run before js/analytics.js has loaded.
  async function withEarlyScripts(page, tags, settingsCopy) {
    await page.route("**/index.html", async (route) => {
      const res = await route.fetch();
      let html = await res.text();
      html = html.replace("</head>", tags + "</head>");
      if (settingsCopy) {
        html = html.replace(
          /<meta name="pr-settings-fallback" content='[^']*'/,
          `<meta name="pr-settings-fallback" content='${JSON.stringify(settingsCopy)}'`,
        );
      }
      await route.fulfill({ response: res, body: html });
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.route(PLAUSIBLE, (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: RECORDER }),
    );
    // A script of this site with a mistake in it; the error message holds something "typed".
    await page.route("**/js/test-broken.js*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: 'var typed = "Jamie 801-555-0199";\nnull.missing(typed);\n',
      }),
    );
  });

  test("a script error and a file that fails to load are reported without the message", async ({ page, context }) => {
    await useConfig(page, ON);
    await withEarlyScripts(page, '<script src="js/test-broken.js"></script><script src="js/test-missing.js"></script>');
    await page.goto("/index.html");
    await expect
      .poll(() => reports(page))
      .toEqual([
        ["Script error", { kind: "TypeError", source: "/js/test-broken.js:2:6", page: "/index.html" }],
        ["Script error", { kind: "File failed to load", source: "/js/test-missing.js", page: "/index.html" }],
      ]);
    // An error after the page has loaded is reported too, once however often it happens.
    await page.evaluate(() => {
      const again = () => {
        const s = document.createElement("script");
        s.src = "js/test-broken.js?again=" + Math.random();
        document.head.appendChild(s);
      };
      again();
      again();
    });
    await expect.poll(async () => (await reports(page)).length).toBe(2);
    await page.waitForTimeout(300);
    expect(await reports(page)).toHaveLength(2);
    const sent = JSON.stringify(await page.evaluate(() => window.__details));
    expect(sent).not.toMatch(/Jamie|555|Cannot read|reading/);
    expect(await context.cookies()).toEqual([]);
  });

  test("no more than 5 reports from one page view", async ({ page }) => {
    await useConfig(page, ON);
    await page.goto("/index.html");
    await expect.poll(() => counted(page)).toEqual([]);
    await page.evaluate(() => {
      for (let i = 0; i < 8; i++) {
        const s = document.createElement("script");
        s.src = "js/test-missing-" + i + ".js";
        document.head.appendChild(s);
      }
    });
    await expect.poll(async () => (await reports(page)).length).toBe(5);
    await page.waitForTimeout(500);
    expect(await reports(page)).toHaveLength(5);
  });

  test("the settings failing to load is reported, using the copy of the settings in the page", async ({ page }) => {
    await page.route("**/site-config.json", (route) => route.fulfill({ status: 500, body: "" }));
    await withEarlyScripts(page, "", {
      analytics: { enabled: true, provider: "plausible", domain: "example.test" },
      errorReports: { enabled: true },
    });
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "defaults");
    await expect
      .poll(() => reports(page))
      .toEqual([["Settings failed to load", { reason: "Not loaded: HTTP 500", page: "/index.html" }]]);
  });

  test("unusable prices in the settings are reported too", async ({ page }) => {
    await useConfig(page, Object.assign({ prices: { cabinetEach: "sixty" } }, ON));
    await page.goto("/index.html");
    await expect
      .poll(() => reports(page))
      .toEqual([["Settings failed to load", { reason: "Prices unusable", page: "/index.html" }]]);
  });

  test("off by default: with counting on but error reports off, nothing is reported", async ({ page }) => {
    await useConfig(page, { analytics: ON.analytics });
    await withEarlyScripts(page, '<script src="js/test-broken.js"></script>');
    await page.goto("/index.html");
    await page.click("#ai-chat-quote-starter");
    await expect.poll(() => counted(page)).toEqual(["Estimate started"]);
    expect(await reports(page)).toEqual([]);
  });

  test("the Privacy Notice mentions error reports only while they are on", async ({ page }) => {
    await useConfig(page, { analytics: ON.analytics });
    await page.goto("/privacy.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    let text = await page.locator("main").innerText();
    expect(text).not.toContain("goes wrong for you");
    expect(text).toContain("Global Privacy Control signal, nothing is counted.");

    await page.unrouteAll();
    await useConfig(page, ON);
    await page.goto("/privacy.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    text = await page.locator("main").innerText();
    expect(text).toContain("It is also told when something on this website goes wrong for you");
    expect(text).toContain("The error's own message is never sent");
    expect(text).toContain("Global Privacy Control signal, nothing is counted or reported.");
  });

  test("nothing is reported when the browser sends Global Privacy Control", async ({ page }) => {
    await useConfig(page, ON);
    await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
    await withEarlyScripts(page, '<script src="js/test-broken.js"></script>');
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await page.waitForTimeout(300);
    expect(await reports(page)).toEqual([]);
  });
});
