"use strict";

// scripts/sync-pages.mjs writes the published prices from site-config.json
// into the page files, and tells a price-only difference from any other.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pricing, TEST_PRICES } = require("./test-prices.js");

const ROOT = path.join(__dirname, "..", "..");

test("page price text comes from the published prices, and a price-only change is recognised", async () => {
  const { renderPage, withoutPriceText } = await import("../../scripts/sync-pages.mjs");
  const page = { file: "index.html", base: "" };
  const source = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  try {
    Pricing.setPublishedPrices(
      Pricing.validatePublishedPrices(Object.assign({}, TEST_PRICES, { cabinetEach: 75 })).prices,
    );
    const changed = await renderPage(source, page);
    assert.match(changed, /<span data-price="Cabinet_Price">\$75<\/span>/);
    assert.notEqual(changed, source);
    assert.equal(withoutPriceText(changed), withoutPriceText(source));
    // Any other change is not price-only.
    assert.notEqual(withoutPriceText(changed.replace("How We Price", "How We Charge")), withoutPriceText(source));
  } finally {
    Pricing.setPublishedPrices(Pricing.validatePublishedPrices(TEST_PRICES).prices);
  }
});

test("each page carries a copy of the visitor-count settings, which may lag behind but never do more", async () => {
  const { renderPage, withoutPriceText, settingsFallback, fallbackDoesMore } =
    await import("../../scripts/sync-pages.mjs");
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "site-config.json"), "utf8"));
  const source = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const rendered = await renderPage(source, { file: "index.html", base: "" });
  const copy = /<meta name="pr-settings-fallback" content='([^']*)'/.exec(rendered);
  assert.ok(copy, "the head has the settings copy");
  assert.deepEqual(JSON.parse(copy[1]), settingsFallback(raw));

  // Only what is needed, and error reports only with counting on.
  const on = { analytics: { enabled: true, provider: "plausible", domain: "x.test" }, errorReports: { enabled: true } };
  assert.deepEqual(settingsFallback(on), {
    analytics: { enabled: true, provider: "plausible", domain: "x.test", scriptUrl: "", servicePrivacyUrl: "" },
    errorReports: { enabled: true },
  });
  assert.deepEqual(settingsFallback({ errorReports: { enabled: true } }), {
    analytics: { enabled: false },
    errorReports: { enabled: false },
  });

  // A page whose copy is out of date only in that copy is a notice, not a failure...
  const withCopy = (settings) =>
    rendered.replace(copy[0], `<meta name="pr-settings-fallback" content='${JSON.stringify(settings)}'`);
  assert.equal(withoutPriceText(withCopy(on)), withoutPriceText(rendered));
  const off = { analytics: { enabled: false }, errorReports: { enabled: false } };
  assert.equal(fallbackDoesMore(withCopy(off), on), false);
  // ...unless the page would count or report what site-config.json has switched off.
  assert.equal(fallbackDoesMore(withCopy(on), off), true);
  assert.equal(fallbackDoesMore(withCopy(on), { analytics: on.analytics, errorReports: { enabled: false } }), true);
  assert.equal(fallbackDoesMore(withCopy(on), on), false);
});
