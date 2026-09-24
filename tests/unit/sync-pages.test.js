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
