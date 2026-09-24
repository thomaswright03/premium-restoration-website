"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Business = require("../../js/business-info.js");

const ROOT = path.join(__dirname, "..", "..");

test("contact details and links are derived from one place", () => {
  assert.equal(Business.PHONE_HREF, "tel:+13853568733");
  assert.equal(Business.EMAIL_HREF, "mailto:" + Business.EMAIL);
  assert.equal(Business.phoneHref("(801) 555-0100"), "tel:+18015550100");
});

test("the business line names the owner only when a legal name is set", () => {
  assert.equal(Business.businessLine(""), "Premium Restoration, operated by an individual (not a registered company)");
  assert.equal(
    Business.businessLine("  Test Owner  "),
    "Premium Restoration, operated by Test Owner, an individual (not a registered company)",
  );
  assert.equal(Business.businessLine(undefined), Business.businessLine(""));
});

test("no other script repeats the phone number or email address", () => {
  const dir = path.join(ROOT, "js");
  const offenders = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js") && f !== "business-info.js")
    .filter((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      return text.includes(Business.PHONE) || text.includes(Business.EMAIL) || text.includes("3568733");
    });
  assert.deepEqual(offenders, []);
});

test("page sync fills data-contact elements and flags unmarked copies", async () => {
  const { renderPage, strayContacts } = await import(path.join(ROOT, "scripts/sync-pages.mjs"));
  const html =
    '<p>Call <a href="tel:+10000000000" data-contact="phone">old</a> or email ' +
    '<a href="mailto:old@example.com?subject=Privacy%20request" data-contact="email">old@example.com</a>, ' +
    'texts to <span data-contact="phone">old</span>.</p>';
  const out = await renderPage(html, { file: "test.html", base: "" });
  assert.ok(out.includes(`href="${Business.PHONE_HREF}" data-contact="phone">${Business.PHONE}</a>`));
  assert.ok(out.includes(`href="${Business.EMAIL_HREF}?subject=Privacy%20request"`));
  assert.ok(out.includes(`<span data-contact="phone">${Business.PHONE}</span>`));
  assert.deepEqual(strayContacts(out), []);
  assert.deepEqual(strayContacts(`<a href="tel:+1">${Business.PHONE}</a>`), [Business.PHONE, 'href="tel:']);
});
