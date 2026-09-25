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

test("computeLayout: a fixture is dropped rather than poking through the opposite wall when the room is too shallow for its depth+clearance", () => {
  // A shower needs 3.2ft depth + 24in front clearance = 5.2ft into the
  // room, in whichever direction it projects. A 4x4 room is too shallow in
  // BOTH directions — every wall's span has room for the shower's 3.2ft
  // width, but no wall's opposite-side room depth reaches 5.2ft, so it
  // must be dropped everywhere rather than placed poking through a wall.
  var result = L.computeLayout({ widthFt: 4, lengthFt: 4, fixtureCounts: { Shower_Quantity: 1 } });
  assert.equal(result.placements.filter((p) => p.fixtureKey === "Shower_Quantity").length, 0);
  assert.equal(result.droppedCounts.Shower_Quantity, 1);
});

test("computeLayout: the same fixture placed on a wall whose span is short but whose room-depth (the perpendicular dimension) is ample still fits", () => {
  // 10ft wide x 4ft long: the N/S walls run along the 10ft span but only
  // project 4ft into the room (too shallow for the shower) — while the E/W
  // walls run along the shorter 4ft span but project a full 10ft into the
  // room, ample depth. A correct algorithm places it there, not drops it.
  var result = L.computeLayout({ widthFt: 10, lengthFt: 4, fixtureCounts: { Shower_Quantity: 1 } });
  var placed = result.placements.filter((p) => p.fixtureKey === "Shower_Quantity");
  assert.equal(placed.length, 1);
  assert.ok(["E", "W"].indexOf(placed[0].wallId) !== -1);
});

test("computeLayout: a fixture that fits the room's depth is still placed normally", () => {
  var result = L.computeLayout({ widthFt: 10, lengthFt: 8, fixtureCounts: { Shower_Quantity: 1 } });
  assert.equal(result.placements.filter((p) => p.fixtureKey === "Shower_Quantity").length, 1);
  assert.equal(result.droppedCounts.Shower_Quantity, undefined);
});

test("computeLayout: a fixture on one wall is rejected for clipping another's clearance on an adjacent wall, even though each wall alone has room", () => {
  // 6x6ft: every wall's own span (6ft) comfortably exceeds one bathtub's
  // 5.2ft wall-span, so the OLD same-wall-only fit test would have placed
  // both (on two different walls, independently). With real front-clearance
  // (depth 2.6ft + 21in code clearance = 4.35ft projected into the room),
  // any second wall's clearance zone clips the first bathtub's near this
  // room's shared corners — only one can actually fit.
  var result = L.computeLayout({ widthFt: 6, lengthFt: 6, fixtureCounts: { Bathtub_Quantity: 2 } });
  var placed = result.placements.filter((p) => p.fixtureKey === "Bathtub_Quantity");
  assert.equal(placed.length, 1);
  assert.equal(result.droppedCounts.Bathtub_Quantity, 1);
});

test("computeLayout: toilet spacing reflects real centerline clearance (15in), not just its own physical width", () => {
  // Toilet wallSpan is 1.7ft (half = 0.85ft), but CLEARANCE_IN.Toilet_Quantity.side
  // is 15in (1.25ft) — the code clearance is the larger of the two and must
  // be what actually determines placement, not the fixture's own half-width.
  var result = L.computeLayout({ widthFt: 10, lengthFt: 8, fixtureCounts: { Toilet_Quantity: 1 } });
  var toilet = result.placements[0];
  assert.equal(toilet.wallId, "N");
  assert.equal(toilet.x, 1.25); // originX(0) + dirX(1) * halfWidth(max(0.85, 15/12) = 1.25)
});

test("CLEARANCE_IN exposes representative code-minimum side/front clearances for every floor-standing fixture", () => {
  [
    "Toilet_Quantity",
    "Sink_Quantity",
    "Bathtub_Quantity",
    "Shower_Quantity",
    "Vanity_Quantity",
    "Cabinet_Quantity",
    "Door_Quantity",
  ].forEach((key) => {
    var c = L.CLEARANCE_IN[key];
    assert.ok(c, `${key} should have a clearance entry`);
    assert.equal(typeof c.side, "number");
    assert.equal(typeof c.front, "number");
    assert.ok(c.side >= 0 && c.front >= 0);
  });
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

// --- plumbingWallIds -------------------------------------------------

test("PLUMBING_FIXTURE_KEYS exposes exactly the fixtures that need to be on a plumbing wall", () => {
  assert.deepEqual(
    L.PLUMBING_FIXTURE_KEYS.slice().sort(),
    ["Bathtub_Quantity", "Shower_Quantity", "Sink_Quantity", "Toilet_Quantity"].sort(),
  );
});

test("computeLayout: plumbingWallIds omitted is unrestricted (back-compat) — toilet lands on its normal default wall", () => {
  var result = L.computeLayout({ widthFt: 10, lengthFt: 8, fixtureCounts: { Toilet_Quantity: 1 } });
  assert.equal(result.placements[0].wallId, "N");
});

test("computeLayout: plumbingWallIds restricts a plumbing fixture to only the named wall(s)", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Toilet_Quantity: 1 },
    plumbingWallIds: ["S"],
  });
  assert.equal(result.placements[0].wallId, "S");
});

test("computeLayout: plumbingWallIds accepts multiple walls, and a fixture that fits none of them is dropped", () => {
  var restricted = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Toilet_Quantity: 1 },
    plumbingWallIds: ["E", "W"],
  });
  assert.ok(["E", "W"].indexOf(restricted.placements[0].wallId) !== -1);

  var impossible = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Toilet_Quantity: 1 },
    plumbingWallIds: ["nonexistent-wall-id"],
  });
  assert.equal(impossible.placements.filter((p) => p.fixtureKey === "Toilet_Quantity").length, 0);
  assert.equal(impossible.droppedCounts.Toilet_Quantity, 1);
});

test("computeLayout: plumbingWallIds does not affect non-plumbing fixtures (door still uses the normal preferWall/scan)", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Toilet_Quantity: 1, Door_Quantity: 1 },
    plumbingWallIds: ["N"],
  });
  var door = result.placements.filter((p) => p.fixtureKey === "Door_Quantity")[0];
  assert.equal(door.wallId, "S"); // South-preferred, unaffected by the toilet's restriction
});

// --- entryPoints -------------------------------------------------

test("computeLayout: entryPoints places a door at the customer's exact wall + offset", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: {},
    entryPoints: [{ wallId: "E", offsetFt: 3, hasDoor: true }],
  });
  var doors = result.placements.filter((p) => p.fixtureKey === "Door_Quantity");
  assert.equal(doors.length, 1);
  assert.equal(doors[0].wallId, "E");
  assert.equal(doors[0].hasDoor, true);
});

test("computeLayout: entryPoints entirely replaces the automatic Door_Quantity scan, ignoring the fixture count", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Door_Quantity: 5 },
    entryPoints: [
      { wallId: "N", offsetFt: 2 },
      { wallId: "E", offsetFt: 2 },
    ],
  });
  assert.equal(result.placements.filter((p) => p.fixtureKey === "Door_Quantity").length, 2);
});

test("computeLayout: hasDoor defaults to true and can be explicitly false (an open archway)", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    entryPoints: [
      { wallId: "N", offsetFt: 2 },
      { wallId: "E", offsetFt: 2, hasDoor: false },
    ],
  });
  var doors = result.placements.filter((p) => p.fixtureKey === "Door_Quantity");
  assert.equal(doors.filter((d) => d.wallId === "N")[0].hasDoor, true);
  assert.equal(doors.filter((d) => d.wallId === "E")[0].hasDoor, false);
});

test("computeLayout: an entry point is reserved before the automatic scan, so auto-placed fixtures avoid it", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    fixtureCounts: { Toilet_Quantity: 1 },
    entryPoints: [{ wallId: "N", offsetFt: 1.25 }], // exactly where the toilet would otherwise land
  });
  var toilet = result.placements.filter((p) => p.fixtureKey === "Toilet_Quantity")[0];
  var door = result.placements.filter((p) => p.fixtureKey === "Door_Quantity")[0];
  assert.ok(toilet, "toilet should still be placed, just not at the door's spot");
  assert.ok(door);
  assert.notEqual(toilet.wallId + ":" + toilet.x, door.wallId + ":" + door.x);
});

test("computeLayout: two entry points that would overlap on the same wall — the second is dropped, held to the same rules as any other fixture", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    entryPoints: [
      { wallId: "N", offsetFt: 2 },
      { wallId: "N", offsetFt: 2.2 }, // well within the door's own clearance envelope
    ],
  });
  var doors = result.placements.filter((p) => p.fixtureKey === "Door_Quantity");
  assert.equal(doors.length, 1);
  assert.equal(result.droppedCounts.Door_Quantity, 1);
});

test("computeLayout: an entry point on a wall too narrow for the door's footprint is dropped", () => {
  var result = L.computeLayout({
    widthFt: 2,
    lengthFt: 8,
    entryPoints: [{ wallId: "N", offsetFt: 1 }], // N/S span is widthFt=2, less than the door's ~2.5ft requirement
  });
  assert.equal(result.placements.filter((p) => p.fixtureKey === "Door_Quantity").length, 0);
  assert.equal(result.droppedCounts.Door_Quantity, 1);
});

test("computeLayout: an entry point whose wall id doesn't exist is dropped rather than throwing", () => {
  var result = L.computeLayout({
    widthFt: 10,
    lengthFt: 8,
    entryPoints: [{ wallId: "bogus", offsetFt: 2 }],
  });
  assert.equal(result.placements.filter((p) => p.fixtureKey === "Door_Quantity").length, 0);
  assert.equal(result.droppedCounts.Door_Quantity, 1);
});

// --- clampEntryOffset -------------------------------------------------

test("clampEntryOffset keeps an offset within the door's clearance envelope on the given wall span", () => {
  var halfWidth = 1.25; // max(Door wallSpan/2 = 1.25, side clearance 0)
  assert.equal(L.clampEntryOffset(10, -5), halfWidth);
  assert.equal(L.clampEntryOffset(10, 0), halfWidth);
  assert.equal(L.clampEntryOffset(10, 5), 5);
  assert.equal(L.clampEntryOffset(10, 50), 10 - halfWidth);
});

test("clampEntryOffset never goes below the half-width even on a wall shorter than the door's own span", () => {
  assert.equal(L.clampEntryOffset(1, 0.5), 1.25);
});
