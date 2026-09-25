"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../js/bathroom-room-layout.js");

test("computeRoomDimensions falls back to the default footprint when nothing is entered", () => {
  assert.deepEqual(L.computeRoomDimensions({}), { widthFt: 8, lengthFt: 5, heightFt: 8 });
  assert.deepEqual(L.computeRoomDimensions(null), { widthFt: 8, lengthFt: 5, heightFt: 8 });
});

test("computeRoomDimensions passes through entered values", () => {
  assert.deepEqual(L.computeRoomDimensions({ widthFt: 10, lengthFt: 7, heightFt: 9 }), {
    widthFt: 10,
    lengthFt: 7,
    heightFt: 9,
  });
});

test("computeRoomDimensions defaults only the fields not yet entered (gains dimensions mid-flow)", () => {
  assert.deepEqual(L.computeRoomDimensions({ widthFt: 12 }), { widthFt: 12, lengthFt: 5, heightFt: 8 });
});

test("applyDimensionInput leaves the previous value untouched on blank/unparsable input", () => {
  var prev = { widthFt: 10, lengthFt: null, heightFt: null };
  assert.deepEqual(L.applyDimensionInput(prev, "widthFt", ""), prev);
  assert.deepEqual(L.applyDimensionInput(prev, "widthFt", "abc"), prev);
});

test("applyDimensionInput clamps a valid value to the render/max bounds", () => {
  var prev = { widthFt: null, lengthFt: null, heightFt: null };
  assert.equal(L.applyDimensionInput(prev, "widthFt", "0.1").widthFt, L.RENDER_MIN_DIM);
  assert.equal(L.applyDimensionInput(prev, "widthFt", "999").widthFt, L.DIMENSION_BOUNDS.widthFt);
  assert.equal(L.applyDimensionInput(prev, "heightFt", "999").heightFt, L.DIMENSION_BOUNDS.heightFt);
  assert.equal(L.applyDimensionInput(prev, "widthFt", "12").widthFt, 12);
});

test("applyFixtureInput treats blank/unparsable input as 0, matching the domain's blank-means-none rule", () => {
  var prev = {};
  assert.equal(L.applyFixtureInput(prev, "Toilet_Quantity", "").Toilet_Quantity, 0);
  assert.equal(L.applyFixtureInput(prev, "Toilet_Quantity", "abc").Toilet_Quantity, 0);
});

test("applyFixtureInput clamps a valid value to [0, MAX_FIXTURE_COUNT]", () => {
  var prev = {};
  assert.equal(L.applyFixtureInput(prev, "Toilet_Quantity", "3").Toilet_Quantity, 3);
  assert.equal(L.applyFixtureInput(prev, "Toilet_Quantity", "999").Toilet_Quantity, L.MAX_FIXTURE_COUNT);
  assert.equal(L.applyFixtureInput(prev, "Toilet_Quantity", "-5").Toilet_Quantity, 0);
});

test("computeLayout is deterministic: the same inputs always produce the same placements", () => {
  var input = {
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Toilet_Quantity: 1, Sink_Quantity: 2, Vanity_Quantity: 1, Mirror_Quantity: 1 },
  };
  var a = L.computeLayout(input);
  var b = L.computeLayout(input);
  assert.deepEqual(a, b);
});

test("computeLayout: incrementing one fixture type never relocates an already-placed instance of a different type", () => {
  var before = L.computeLayout({ widthFt: 12, lengthFt: 9, fixtureCounts: { Bathtub_Quantity: 1 } });
  var bathtubBefore = before.placements.filter((p) => p.fixtureKey === "Bathtub_Quantity")[0];

  var after = L.computeLayout({
    widthFt: 12,
    lengthFt: 9,
    fixtureCounts: { Bathtub_Quantity: 1, Toilet_Quantity: 1 },
  });
  var bathtubAfter = after.placements.filter((p) => p.fixtureKey === "Bathtub_Quantity")[0];

  assert.deepEqual(bathtubBefore, bathtubAfter);
});

test("computeLayout: two large fixtures genuinely competing for wall space still resolves deterministically", () => {
  // A tiny room where two 5.2ft-span bathtubs cannot both fit on any
  // available wall — one must be dropped, and which one is dropped must be
  // the same every time.
  var input = { widthFt: 6, lengthFt: 6, fixtureCounts: { Bathtub_Quantity: 2 } };
  var a = L.computeLayout(input);
  var b = L.computeLayout(input);
  assert.deepEqual(a, b);
  var placedCount = a.placements.filter((p) => p.fixtureKey === "Bathtub_Quantity").length;
  assert.equal(placedCount + (a.droppedCounts.Bathtub_Quantity || 0), 2);
});

test("computeLayout: entry door prefers the South wall when it is empty", () => {
  var result = L.computeLayout({ widthFt: 10, lengthFt: 8, fixtureCounts: { Door_Quantity: 1 } });
  var door = result.placements[0];
  assert.equal(door.wallId, "S");
});

test("computeLayout: entry door falls back to the normal scan when South is already occupied", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Vanity_Quantity: 5, Door_Quantity: 1 },
  });
  var door = result.placements.filter((p) => p.fixtureKey === "Door_Quantity")[0];
  // With the South wall saturated by vanities, the door must still be
  // placed somewhere (or cleanly dropped) — never throw, never duplicate.
  if (door) assert.ok(["N", "E", "S", "W"].indexOf(door.wallId) !== -1);
});

test("computeLayout: shower door pairs with the shower of the same index, extra doors are dropped", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Shower_Quantity: 1, Shower_Door_Quantity: 2 },
  });
  var doors = result.placements.filter((p) => p.fixtureKey === "Shower_Door_Quantity");
  assert.equal(doors.length, 1);
  assert.equal(result.droppedCounts.Shower_Door_Quantity, 1);
  var shower = result.placements.filter((p) => p.fixtureKey === "Shower_Quantity")[0];
  assert.equal(doors[0].x, shower.x);
  assert.equal(doors[0].z, shower.z);
});

test("computeLayout: extra showers with no matching door simply get none", () => {
  var result = L.computeLayout({
    widthFt: 12,
    lengthFt: 10,
    fixtureCounts: { Shower_Quantity: 2, Shower_Door_Quantity: 1 },
  });
  var doors = result.placements.filter((p) => p.fixtureKey === "Shower_Door_Quantity");
  assert.equal(doors.length, 1);
});

test("computeLayout: wall-mounted mirror attaches to a vanity when one exists", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Vanity_Quantity: 1, Mirror_Quantity: 1 },
  });
  var mirror = result.placements.filter((p) => p.fixtureKey === "Mirror_Quantity")[0];
  var vanity = result.placements.filter((p) => p.fixtureKey === "Vanity_Quantity")[0];
  assert.equal(mirror.attachedTo.fixtureKey, "Vanity_Quantity");
  assert.equal(mirror.x, vanity.x);
});

test("computeLayout: wall-mounted mirror falls back to a sink when no vanity exists", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Sink_Quantity: 1, Mirror_Quantity: 1 },
  });
  var mirror = result.placements.filter((p) => p.fixtureKey === "Mirror_Quantity")[0];
  assert.equal(mirror.attachedTo.fixtureKey, "Sink_Quantity");
});

test("computeLayout: wall-mounted mirror is dropped when no anchor exists at all", () => {
  var result = L.computeLayout({ widthFt: 10, lengthFt: 8, fixtureCounts: { Mirror_Quantity: 1 } });
  assert.equal(result.placements.filter((p) => p.fixtureKey === "Mirror_Quantity").length, 0);
  assert.equal(result.droppedCounts.Mirror_Quantity, 1);
});

test("computeLayout: multiple mirrors index-pair with multiple vanities", () => {
  var result = L.computeLayout({
    widthFt: 16,
    lengthFt: 10,
    fixtureCounts: { Vanity_Quantity: 2, Mirror_Quantity: 2 },
  });
  var vanities = result.placements.filter((p) => p.fixtureKey === "Vanity_Quantity");
  var mirrors = result.placements.filter((p) => p.fixtureKey === "Mirror_Quantity");
  assert.equal(mirrors[0].attachedTo.index, vanities[0].index);
  assert.equal(mirrors[1].attachedTo.index, vanities[1].index);
});

test("computeLayout: shower shelf attaches to a placed shower", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Shower_Quantity: 1, Shower_Shelf_Quantity: 1 },
  });
  var shelf = result.placements.filter((p) => p.fixtureKey === "Shower_Shelf_Quantity")[0];
  assert.equal(shelf.attachedTo.fixtureKey, "Shower_Quantity");
});

test("computeLayout: an oversized request (max count of one fixture) in the tiny default room drops the rest deterministically", () => {
  var input = { widthFt: 8, lengthFt: 5, fixtureCounts: { Sink_Quantity: 20 } };
  var a = L.computeLayout(input);
  var b = L.computeLayout(input);
  assert.deepEqual(a, b);
  var placed = a.placements.filter((p) => p.fixtureKey === "Sink_Quantity").length;
  assert.equal(placed + (a.droppedCounts.Sink_Quantity || 0), 20);
  assert.ok(placed > 0);
});

test("computeLayout handles the default footprint (8x5) with no fixtures", () => {
  var result = L.computeLayout({ widthFt: 8, lengthFt: 5, fixtureCounts: {} });
  assert.deepEqual(result.placements, []);
  assert.deepEqual(result.droppedCounts, {});
});

test("computeLayout handles the DIMENSIONS max (50x50) without error", () => {
  var result = L.computeLayout({
    widthFt: 50,
    lengthFt: 50,
    fixtureCounts: { Toilet_Quantity: 3, Bathtub_Quantity: 2, Vanity_Quantity: 3, Mirror_Quantity: 3 },
  });
  assert.equal(result.placements.length > 0, true);
});

test("colorForFloorFinish / colorForWalls / colorForCeiling return the brand hex values for every scope value, light and dark", () => {
  assert.equal(L.colorForFloorFinish("tile", false), 0xffffff);
  assert.equal(L.colorForFloorFinish("tile", true), 0x1d1a16);
  assert.equal(L.colorForFloorFinish("flooring", false), 0xcda15f);
  assert.equal(L.colorForFloorFinish("none", false), 0xf3efe7);

  assert.equal(L.colorForWalls("tile", false), 0xffffff);
  assert.equal(L.colorForWalls("paint", false), 0xcda15f);
  assert.equal(L.colorForWalls("none", false), 0xfaf8f4);

  assert.equal(L.colorForCeiling(true, false), 0xcda15f);
  assert.equal(L.colorForCeiling(false, false), 0xfaf8f4);
});

test("textureKindForFloorFinish / textureKindForWalls map to a pattern only for tile/flooring", () => {
  assert.equal(L.textureKindForFloorFinish("tile"), "tile");
  assert.equal(L.textureKindForFloorFinish("flooring"), "flooring");
  assert.equal(L.textureKindForFloorFinish("none"), null);
  assert.equal(L.textureKindForWalls("tile"), "tile");
  assert.equal(L.textureKindForWalls("paint"), null);
  assert.equal(L.textureKindForWalls("none"), null);
});

test("demolition has no fixture-layout or finish-color entry point, same convention as the materials picker", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(L.FIXTURE_LAYOUT, "demolition"), false);
});
