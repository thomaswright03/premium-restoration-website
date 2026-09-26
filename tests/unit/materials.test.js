"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../js/bathroom-pricing.js");
const M = require("../../js/materials-pricing.js");

test("materials picker holds real generated data, not mock data", () => {
  assert.equal(M.IS_MOCK_DATA, false);
});

test("categoriesFromLines only offers materials for work actually priced, never demolition", () => {
  const scope = { demolition: true, floorFinish: "tile", walls: "paint", paintCeiling: true };
  const values = { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8, Toilet_Quantity: 1 };
  const result = P.computePublicEstimate(values, scope);
  const categories = M.categoriesFromLines(result.lines);
  const keys = categories.map((c) => c.key);

  assert.ok(!keys.includes("demolition"), "demolition has no purchasable material");
  assert.ok(keys.includes("floorTile"));
  assert.ok(keys.includes("wallPaint"));
  assert.ok(keys.includes("ceilingPaint"));
  assert.ok(keys.includes("Toilet_Quantity"));
  assert.ok(!keys.includes("Sink_Quantity"), "no sink was chosen, so no sink category is offered");
});

test("categoriesFromLines carries the label, quantity and unit straight from the labor line", () => {
  const scope = { demolition: false, floorFinish: "none", walls: "none", paintCeiling: false };
  const values = { Toilet_Quantity: 2 };
  const result = P.computePublicEstimate(values, scope);
  const toilet = M.categoriesFromLines(result.lines).find((c) => c.key === "Toilet_Quantity");

  assert.equal(toilet.label, "Toilets");
  assert.equal(toilet.qty, 2);
  assert.equal(toilet.unit, "units");
});

test("bestRetailer picks the cheapest and only adds a comparison note when there is more than one retailer", () => {
  const single = M.bestRetailer([{ name: "Home Depot", price: 50, url: "https://www.homedepot.com/" }]);
  assert.equal(single.price, 50);
  assert.equal(single.compareNote, null);

  const two = M.bestRetailer([
    { name: "Home Depot", price: 60, url: "https://www.homedepot.com/" },
    { name: "Lowe's", price: 55, url: "https://www.lowes.com/" },
  ]);
  assert.equal(two.name, "Lowe's");
  assert.equal(two.price, 55);
  assert.match(two.compareNote, /Home Depot/);
  assert.match(two.compareNote, /\$60\.00/);
});

test("getOptionsForCategory resolves the cheapest retailer per option and applies the ZIP factor consistently", () => {
  const options = M.getOptionsForCategory("Toilet_Quantity", "84101");
  assert.ok(options.length > 0);
  options.forEach((opt) => {
    assert.ok(opt.best.price > 0);
  });
  // Same ZIP always gives the same adjusted price (deterministic mock).
  const again = M.getOptionsForCategory("Toilet_Quantity", "84101");
  assert.deepEqual(options[0].best.price, again[0].best.price);
});

test("getOptionsForCategory carries each option's real product photo through, or null if it has none", () => {
  const options = M.getOptionsForCategory("Toilet_Quantity", "84101");
  assert.ok(options.length > 0);
  options.forEach((opt) => {
    assert.ok(opt.imageUrl === null || typeof opt.imageUrl === "string");
  });
  assert.ok(
    options.some((opt) => typeof opt.imageUrl === "string" && opt.imageUrl.length > 0),
    "the real scraped catalog should have at least one toilet with a photo",
  );
});

test("getOptionsForCategory drops a malformed catalog entry (no retailers) instead of crashing or returning best: null", () => {
  // A future re-scrape could in principle commit an entry with an empty or
  // missing retailers array (nothing priced for it at all) — every caller
  // downstream (js/script.js's appendMaterialCategoryForm) assumes
  // opt.best is always a real object, so getOptionsForCategory must never
  // hand one back with best: null.
  const malformed = { id: "test-malformed", name: "Malformed Test Option", imageUrl: null, retailers: [] };
  M.CATALOG.Toilet_Quantity.push(malformed);
  try {
    const options = M.getOptionsForCategory("Toilet_Quantity", "84101");
    assert.ok(
      !options.some((o) => o.id === "test-malformed"),
      "the malformed entry should be filtered out, not passed through",
    );
    options.forEach((o) => assert.ok(o.best !== null));
  } finally {
    M.CATALOG.Toilet_Quantity.pop();
  }
});

test("bestRetailer carries a missing URL through as null rather than the string 'null'", () => {
  // The scraper doesn't always get a canonicalUrl back from Home Depot's
  // own search data (some listings genuinely don't have one) — bestRetailer
  // must pass that through as a real null so callers (js/script.js) can
  // render a plain label instead of a broken href="null" link or a PDF
  // line reading "(null)".
  const best = M.bestRetailer([{ name: "Home Depot", price: 249, url: null }]);
  assert.equal(best.url, null);
});

test("guessFinishColor matches common retail finish words and falls back to null", () => {
  assert.equal(M.guessFinishColor("KOHLER Elmbrook Sliding Frameless Shower Door in Matte Black"), 0x1c1c1c);
  assert.equal(M.guessFinishColor("Glacier Bay Toilet in White"), 0xfdfcf9);
  assert.equal(M.guessFinishColor("Delta Faucet in Oil-Rubbed Bronze"), 0x3d2b1f);
  assert.equal(M.guessFinishColor("Glacier Bay Towel Tower in Nickel"), 0xb8b3ab);
  assert.equal(M.guessFinishColor("Derrin Mirror in Silver"), 0xd8dadb);
  assert.equal(M.guessFinishColor("Corso Italia Alpe Graphite Matte Tile"), 0x4a4a4a);
  assert.equal(M.guessFinishColor("Some Vanity With No Finish Word"), null);
  assert.equal(M.guessFinishColor(""), null);
  assert.equal(M.guessFinishColor(null), null);
});

test("mockRegionalFactor is deterministic and stays in a plausible +/-10% range", () => {
  assert.equal(M.mockRegionalFactor("84101"), M.mockRegionalFactor("84101"));
  const factor = M.mockRegionalFactor("84101");
  assert.ok(factor >= 0.9 && factor <= 1.1, "factor " + factor + " should be a modest adjustment");
  assert.equal(M.mockRegionalFactor(""), 1, "no ZIP means no adjustment");
});

test("computeMaterialCost is qty x unit price for fixtures and surfaces priced per unit or per sq ft", () => {
  const eachItem = M.computeMaterialCost("Toilet_Quantity", 2, "units", 200);
  assert.equal(eachItem.cost, 400);
  assert.equal(eachItem.quantityLabel, "2 units");

  const sqFtItem = M.computeMaterialCost("floorTile", 32, "sq ft", 4);
  assert.equal(sqFtItem.cost, 128);
  assert.equal(sqFtItem.quantityLabel, "32 sq ft");
});

test("computeMaterialCost buys whole gallons of paint, rounding up to cover the area", () => {
  const smallJob = M.computeMaterialCost("wallPaint", 150, "sq ft", 35);
  assert.equal(smallJob.quantityLabel, "1 gallon");
  assert.equal(smallJob.cost, 35);

  const biggerJob = M.computeMaterialCost("wallPaint", 450, "sq ft", 35);
  assert.equal(biggerJob.quantityLabel, "2 gallons");
  assert.equal(biggerJob.cost, 70);

  const zeroJob = M.computeMaterialCost("ceilingPaint", 0, "sq ft", 28);
  assert.equal(zeroJob.quantityLabel, "1 gallon", "always buy at least one gallon once the category applies");
});
