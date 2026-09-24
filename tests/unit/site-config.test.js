"use strict";

// Checks the committed site-config.json the way the pages read it, so a
// setting that would show wrong or vague text fails `npm test` (and CI)
// before it is deployed.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SiteConfig = require("../../js/site-config.js");

const FILE = path.join(__dirname, "..", "..", "site-config.json");

test("site-config.json is valid JSON", () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(FILE, "utf8")));
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
