"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../js/bathroom-pricing.js");
const M = require("../../js/materials-pricing.js");

test("materials picker is explicitly marked as using mock data", () => {
  assert.equal(M.IS_MOCK_DATA, true);
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
