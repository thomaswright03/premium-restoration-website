"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../js/surface-finishes.js");
const M = require("../../js/materials-pricing.js");

test("parseUnitSizeIn reads the tile/plank face size out of real product names", () => {
  assert.deepEqual(
    S.parseUnitSizeIn("TrafficMaster Vigo Gris 12 in. x 24 in. Matte Ceramic Stone Look Floor and Wall Tile"),
    [12, 24],
  );
  assert.deepEqual(
    S.parseUnitSizeIn("Daltile Restore Bright White 4-1/4 in. x 4-1/4 in. Ceramic Wall Tile"),
    [4.25, 4.25],
  );
  assert.deepEqual(
    S.parseUnitSizeIn("Lifeproof Sterling Oak 22 MIL x 8.7 in. W x 48 in. L Click Lock Waterproof Luxury Vinyl Plank"),
    [8.7, 48],
  );
  assert.deepEqual(
    S.parseUnitSizeIn(
      "Flooret Modin Nakan Craftsman 40 MIL x 3.35 in x 72 in Waterproof Click Lock Luxury Vinyl Plank",
    ),
    [3.35, 72],
  );
  assert.equal(S.parseUnitSizeIn("BEHR PRO 5 gal. i100 White Base Semi-Gloss Interior Paint"), null);
  assert.equal(S.parseUnitSizeIn(""), null);
});

test("every surface product in the catalog has a spec with a usable size", () => {
  const categories = M.CATALOG;
  for (const key of Object.keys(S.CATEGORY_SURFACE)) {
    for (const product of categories[key]) {
      const spec = S.specFor(product);
      assert.ok(spec, `${product.id} (${key}) has no surface spec`);
      assert.match(spec.color, /^#[0-9a-f]{6}$/);
      assert.ok(spec.roughness >= 0 && spec.roughness <= 1);
      if (spec.kind !== "paint") {
        assert.ok(spec.sizeIn[0] > 0 && spec.sizeIn[1] > 0, `${product.id} size`);
        assert.notDeepEqual(spec.sizeIn, [12, 12], `${product.id} fell back to the default size`);
      }
    }
  }
});

test("specFor returns null for products without a surface spec", () => {
  assert.equal(S.specFor(null), null);
  assert.equal(S.specFor({ id: "hd-does-not-exist", name: "x" }), null);
});

test("resolveSurfaces only shows a pick while its scope answer still applies", () => {
  const tile = { id: "t" };
  const paint = { id: "p" };
  const plank = { id: "f" };
  const ceiling = { id: "c" };
  const picks = { wallTile: tile, wallPaint: paint, flooring: plank, ceilingPaint: ceiling };

  assert.deepEqual(S.resolveSurfaces({ walls: "tile", floorFinish: "flooring", paintCeiling: true }, picks), {
    floor: plank,
    walls: tile,
    ceiling: ceiling,
  });
  assert.deepEqual(S.resolveSurfaces({ walls: "paint", floorFinish: "tile", paintCeiling: false }, picks), {
    floor: null,
    walls: paint,
    ceiling: null,
  });
  assert.deepEqual(S.resolveSurfaces({}, {}), { floor: null, walls: null, ceiling: null });
});
