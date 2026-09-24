"use strict";

// The PDF's reference, issue date and "prices held until" date
// (js/estimate-pdf.js), and the owner's validity setting in site-config.json.

process.env.TZ = "America/Denver";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Pdf = require("../../js/estimate-pdf.js");
const SiteConfig = require("../../js/site-config.js");

const FILE = path.join(__dirname, "..", "..", "site-config.json");

test("a visitor's estimate gets a new random reference with the date", () => {
  const day = new Date(2026, 8, 24, 23, 30);
  const refs = new Set();
  for (let i = 0; i < 200; i++) {
    const ref = Pdf.estimateReference(day);
    assert.match(ref, /^PR-E-20260924-[A-HJ-NP-Z2-9]{4}$/);
    refs.add(ref);
  }
  assert.ok(refs.size > 190, "references should practically never repeat");
});

test("an admin quote's reference comes from the quote, so every PDF of it matches", () => {
  const quote = { id: "q_1790000000000_k3m9qx", createdAt: new Date(2026, 8, 3, 9).toISOString() };
  assert.equal(Pdf.quoteReference(quote), "PR-Q-20260903-K3M9QX");
  assert.equal(
    Pdf.quoteReference(Object.assign({}, quote, { updatedAt: new Date().toISOString() })),
    "PR-Q-20260903-K3M9QX",
  );
  // Any other kind of id still gives a fixed reference.
  const odd = { id: "imported-17", createdAt: quote.createdAt };
  assert.match(Pdf.quoteReference(odd), /^PR-Q-20260903-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(Pdf.quoteReference(odd), Pdf.quoteReference(Object.assign({}, odd)));
  assert.notEqual(Pdf.quoteReference(odd), Pdf.quoteReference({ id: "imported-18", createdAt: quote.createdAt }));
});

test("prices are held for the owner's number of calendar days, or no date is given", () => {
  const issued = new Date(2026, 8, 24, 16);
  assert.equal(Pdf.heldUntil(issued, null), null);
  assert.equal(Pdf.heldUntil(issued, 0), null);
  assert.deepEqual(Pdf.heldUntil(issued, 30), new Date(2026, 9, 24));
  // Across the clock change on 1 November.
  assert.deepEqual(Pdf.heldUntil(issued, 45), new Date(2026, 10, 8));
});

test("the disclaimer keeps its wording, and names the date only when one is set", () => {
  const text = "It is not a quote. Prices are current as of the date generated and may change. Your actual price…";
  assert.equal(Pdf.withHeldUntil(text, null), text);
  assert.equal(
    Pdf.withHeldUntil(text, new Date(2026, 9, 24)),
    "It is not a quote. Prices are current as of the date generated and are held until October 24, 2026; after that they may change. Your actual price…",
  );
});

test("estimates.validForDays in site-config.json is unset (null) or a whole number of days from 1 to 365", () => {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  assert.ok(raw.estimates && "validForDays" in raw.estimates, "site-config.json needs estimates.validForDays");
  assert.equal(SiteConfig.validForDaysProblem(raw.estimates.validForDays), "", "Fix estimates.validForDays");
});

test("an unusable validity setting is reported and never printed", () => {
  for (const bad of ["30", 0, -5, 1.5, 366, true]) {
    assert.match(SiteConfig.validForDaysProblem(bad), /whole number of days from 1 to 365/, String(bad));
    assert.equal(SiteConfig.normalize({ estimates: { validForDays: bad } }).estimates.validForDays, null);
  }
  for (const ok of [null, undefined, "", 1, 30, 365]) assert.equal(SiteConfig.validForDaysProblem(ok), "");
  assert.equal(SiteConfig.normalize({ estimates: { validForDays: 30 } }).estimates.validForDays, 30);
  assert.equal(SiteConfig.normalize({}).estimates.validForDays, null);
});
