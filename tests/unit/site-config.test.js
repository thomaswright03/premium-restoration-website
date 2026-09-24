"use strict";

// Checks the committed site-config.json the way the pages read it, so a
// setting that would show wrong or vague text fails `npm test` (and CI)
// before it is deployed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SiteConfig = require("../../js/site-config.js");
const Pricing = require("../../js/bathroom-pricing.js");

const FILE = path.join(__dirname, "..", "..", "site-config.json");

test("site-config.json is valid JSON", () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(FILE, "utf8")));
});

test("the published prices in site-config.json are all there and usable", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const check = Pricing.validatePublishedPrices(raw.prices);
  assert.deepEqual(check.errors, [], "Fix these in site-config.json: " + check.errors.join(" "));
  // The pages, chat and estimate read exactly these.
  for (const p of Pricing.PUBLISHED_PRICES) assert.equal(Pricing.DEFAULT_PRICES[p.key], raw.prices[p.setting]);
});

test("every published price is in the settings file and the test prices, with the same names", () => {
  const settings = Object.keys(JSON.parse(fs.readFileSync(FILE, "utf8")).prices).filter((k) => k[0] !== "_");
  const fixture = Object.keys(require("../fixtures/test-prices.json")).filter((k) => k[0] !== "_");
  const expected = Pricing.PUBLISHED_PRICES.map((p) => p.setting);
  assert.deepEqual(settings, expected);
  assert.deepEqual(fixture, expected);
});

test("missing or invalid prices keep the estimator off instead of showing a wrong price", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const ok = SiteConfig.normalize(Object.assign({}, raw, { priceEstimator: { enabled: true } }));
  assert.equal(ok.priceEstimator.enabled, true);
  assert.equal(ok.prices.Cabinet_Price, raw.prices.cabinetEach);
  const broken = SiteConfig.normalize(
    Object.assign({}, raw, {
      priceEstimator: { enabled: true },
      prices: Object.assign({}, raw.prices, { cabinetEach: "sixty" }),
    }),
  );
  assert.equal(broken.priceEstimator.enabled, false);
  assert.equal(broken.prices, null);
  assert.match(broken.priceProblems.join(" "), /cabinetEach must be a number/);
  const none = SiteConfig.normalize(Object.assign({}, raw, { prices: undefined }));
  assert.equal(none.priceEstimator.enabled, false);
});

test("a connected form service is named, so the form text and Privacy Notice name it", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const endpoint = (raw.leadForm && raw.leadForm.endpoint) || "";
  if (!endpoint.trim()) return; // email-app form: nothing to name
  assert.match(endpoint.trim(), /^https:\/\//, "leadForm.endpoint must start with https://");
  const config = SiteConfig.normalize(raw);
  assert.notEqual(
    config.leadForm.serviceName,
    SiteConfig.GENERIC_FORM_SERVICE,
    'Set leadForm.serviceName (e.g. "Formspree") for this endpoint',
  );
});

test("form service names come from the settings, or from a well-known endpoint", () => {
  const named = SiteConfig.normalize({
    leadForm: { endpoint: "https://example.test/f/1", serviceName: " Acme Forms " },
  });
  assert.equal(named.leadForm.serviceName, "Acme Forms");
  const known = SiteConfig.normalize({ leadForm: { endpoint: "https://formspree.io/f/abc123" } });
  assert.equal(known.leadForm.serviceName, "Formspree");
  assert.equal(SiteConfig.formServiceName("https://www.getform.io/f/x"), "Getform");
  assert.equal(SiteConfig.formServiceName("https://notformspree.io.example.test/f"), "");
  const unknown = SiteConfig.normalize({ leadForm: { endpoint: "https://example.test/f/1" } });
  assert.equal(unknown.leadForm.serviceName, SiteConfig.GENERIC_FORM_SERVICE);
});

test("only https endpoints and privacy links are used", () => {
  const config = SiteConfig.normalize({
    leadForm: { endpoint: "http://example.test/f", servicePrivacyUrl: "javascript:alert(1)" },
  });
  assert.equal(config.leadForm.endpoint, "");
  assert.equal(config.leadForm.servicePrivacyUrl, "");
});

test("the safe defaults keep the estimator off and the email-app form", () => {
  const config = SiteConfig.normalize(SiteConfig.DEFAULTS);
  assert.equal(config.priceEstimator.enabled, false);
  assert.equal(config.leadForm.endpoint, "");
});

test("visitor counts are off by default and need a known provider to switch on", () => {
  assert.equal(SiteConfig.normalize(SiteConfig.DEFAULTS).analytics.enabled, false);
  assert.equal(SiteConfig.normalize({}).analytics.enabled, false);
  assert.equal(SiteConfig.normalize({ analytics: { enabled: true } }).analytics.enabled, false);
  assert.equal(SiteConfig.normalize({ analytics: { enabled: true, provider: "google" } }).analytics.enabled, false);
  assert.equal(SiteConfig.normalize({ analytics: { enabled: "true", provider: "vercel" } }).analytics.enabled, false);
  const vercel = SiteConfig.normalize({ analytics: { enabled: true, provider: " Vercel " } }).analytics;
  assert.deepEqual([vercel.enabled, vercel.provider, vercel.serviceName], [true, "vercel", "Vercel Web Analytics"]);
  const plausible = SiteConfig.normalize({
    analytics: { enabled: true, provider: "plausible", scriptUrl: "javascript:x", servicePrivacyUrl: "http://x" },
  }).analytics;
  assert.equal(plausible.serviceName, "Plausible Analytics");
  assert.equal(plausible.scriptUrl, "");
  assert.equal(plausible.servicePrivacyUrl, "");
});

test("if visitor counts are switched on in site-config.json, the provider is one the site supports", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (!(raw.analytics && raw.analytics.enabled === true)) return;
  assert.ok(
    SiteConfig.normalize(raw).analytics.enabled,
    'analytics.provider must be "vercel" or "plausible" when analytics.enabled is true',
  );
});

test("both switches in site-config.json are true or false (no quotes), so flipping them always works", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  assert.equal(typeof raw.priceEstimator.enabled, "boolean", "priceEstimator.enabled must be true or false");
  assert.equal(typeof raw.leadForm.enabled, "boolean", "leadForm.enabled must be true or false");
});

test("leadForm.enabled: false puts the quote form into 'please call us' mode; anything else keeps the form", () => {
  assert.equal(SiteConfig.normalize({ leadForm: { enabled: false } }).leadForm.paused, true);
  assert.equal(SiteConfig.normalize({ leadForm: { enabled: true } }).leadForm.paused, false);
  assert.equal(SiteConfig.normalize({}).leadForm.paused, false);
  assert.equal(SiteConfig.normalize(SiteConfig.DEFAULTS).leadForm.paused, false);
});

test("error reports are off by default, and need visitor counting (their provider) switched on", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (raw.errorReports && raw.errorReports.enabled === true) {
    assert.equal(
      SiteConfig.normalize(raw).analytics.enabled,
      true,
      "errorReports.enabled is true, but analytics is off: switch on analytics with a provider, or set errorReports.enabled to false",
    );
  }
  assert.equal(SiteConfig.normalize({}).errorReports.enabled, false);
  assert.equal(SiteConfig.normalize({ errorReports: { enabled: true } }).errorReports.enabled, false);
  const on = { analytics: { enabled: true, provider: "plausible" }, errorReports: { enabled: true } };
  assert.equal(SiteConfig.normalize(on).errorReports.enabled, true);
  assert.equal(
    SiteConfig.normalize(Object.assign({}, on, { errorReports: { enabled: "true" } })).errorReports.enabled,
    false,
  );
});
