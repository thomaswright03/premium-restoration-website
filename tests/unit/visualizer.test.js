"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../../js/bathroom-visualizer.js");

test("bathroom visualizer is explicitly marked as a mockup, not a real rendering", () => {
  assert.equal(V.IS_MOCK_VISUALIZATION, true);
});

test("visualItemForScopeField maps floor finish choices to the matching visual item", () => {
  assert.deepEqual(V.visualItemForScopeField("floorFinish", "tile"), { key: "floorTile", label: "Floor tile" });
  assert.deepEqual(V.visualItemForScopeField("floorFinish", "flooring"), {
    key: "flooring",
    label: "Other flooring",
  });
  assert.equal(V.visualItemForScopeField("floorFinish", "none"), null);
});

test("visualItemForScopeField maps wall choices to the matching visual item", () => {
  assert.deepEqual(V.visualItemForScopeField("walls", "tile"), { key: "wallTile", label: "Wall tile" });
  assert.deepEqual(V.visualItemForScopeField("walls", "paint"), { key: "wallPaint", label: "Wall paint" });
  assert.equal(V.visualItemForScopeField("walls", "none"), null);
});

test("visualItemForScopeField maps paintCeiling yes/no to the matching visual item", () => {
  assert.deepEqual(V.visualItemForScopeField("paintCeiling", true), { key: "ceilingPaint", label: "Ceiling paint" });
  assert.equal(V.visualItemForScopeField("paintCeiling", false), null);
});

test("visualItemForScopeField never shows a visual item for demolition, same as the materials picker", () => {
  assert.equal(V.visualItemForScopeField("demolition", true), null);
  assert.equal(V.visualItemForScopeField("demolition", false), null);
});

test("visualItemForScopeField returns null for an unknown field", () => {
  assert.equal(V.visualItemForScopeField("somethingElse", "tile"), null);
});

test("visualItemForFixture only shows an item once the quantity is a positive number", () => {
  assert.deepEqual(V.visualItemForFixture("Toilet_Quantity", 2, "Toilets"), {
    key: "Toilet_Quantity",
    label: "2 Toilets",
  });
  assert.equal(V.visualItemForFixture("Toilet_Quantity", 0, "Toilets"), null);
  assert.equal(V.visualItemForFixture("Toilet_Quantity", "", "Toilets"), null);
  assert.equal(V.visualItemForFixture("Toilet_Quantity", "0", "Toilets"), null);
  assert.equal(V.visualItemForFixture("Toilet_Quantity", "abc", "Toilets"), null);
});

test("visualItemForFixture accepts a raw string quantity, as typed into the fixture count field", () => {
  assert.deepEqual(V.visualItemForFixture("Sink_Quantity", "3", "Sinks"), {
    key: "Sink_Quantity",
    label: "3 Sinks",
  });
});
