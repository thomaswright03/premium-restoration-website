// Premium Restoration — real-product surface finishes for the 3D preview.
//
// When a customer picks an actual floor tile, wall tile, flooring or paint
// in the chat's materials step, the 3D room should show THAT product, not a
// generic "tile" color. Flat surface products don't need a 3D scan to look
// right — what makes them read as the real thing is their true unit size
// and layout (a 12x24 in. stone-look tile vs. 4x4 in. glossy squares), their
// color, grout, sheen, and surface character (stone mottling, wood grain,
// a printed encaustic motif). This file holds exactly that, per product, as
// plain data; js/bathroom-room-3d.js turns a spec into PBR texture maps
// (albedo + normal + roughness) procedurally, at real-world scale.
//
// SPEC FIELDS (all optional except kind/color):
//   kind        "tile" | "plank" | "paint"
//   sizeIn      [w, h] of one tile/plank in inches — defaults to the size
//               parsed from the product name (parseUnitSizeIn below)
//   layout      "grid" (stacked) | "offset" (half running bond) |
//               "stagger" (random plank end joints)
//   color       base surface color (sampled from the product's own swatch)
//   variation   0..1 tile-to-tile tone variation
//   grout       grout color; groutIn = joint width in inches
//   roughness   0 (mirror) .. 1 (fully matte) — glazed/semi-gloss ~0.2-0.35
//   character   "stone" | "wood" | "handmade" | "encaustic" | null
//   accent      second color for "encaustic" motifs / wood grain lines
//   maps        { albedo, normal, roughness, sizeIn: [w, h] } — real PBR
//               texture files (manufacturer-supplied or scanned) that
//               override the procedural maps when present. None shipped yet.
//
// Colors were sampled from each product's own listing swatch; they are
// approximations of the real finish, not manufacturer color data.
//
// Loads as a plain browser script (window.SurfaceFinishes) and as a Node
// module (for the unit tests).

(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SurfaceFinishes = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Keyed by catalog product id (tools/scrapers/materials-catalog.json).
  var SPECS = {
    // --- floorTile --------------------------------------------------------
    "hd-300126888": {
      // TrafficMaster Vigo Gris 12x24 matte ceramic, stone look
      kind: "tile",
      layout: "offset",
      color: "#bebab4",
      variation: 0.05,
      grout: "#a8a49c",
      groutIn: 0.125,
      roughness: 0.78,
      character: "stone",
    },
    "hd-313050938": {
      // Daltile Baker Wood 6x24 walnut glazed porcelain, wood look
      kind: "tile",
      layout: "stagger",
      color: "#926a4c",
      accent: "#6b4a33",
      variation: 0.12,
      grout: "#5e4634",
      groutIn: 0.0625,
      roughness: 0.45,
      character: "wood",
    },
    "hd-315506629": {
      // MSI Kenzzi Zenzibar 8x8 encaustic matte porcelain
      kind: "tile",
      layout: "grid",
      color: "#f1f0ea",
      accent: "#2f4f86",
      variation: 0.02,
      grout: "#d9d7cf",
      groutIn: 0.0625,
      roughness: 0.72,
      character: "encaustic",
    },
    // --- wallTile ---------------------------------------------------------
    "hd-302603803": {
      // Daltile Restore Bright White 4-1/4 x 4-1/4 glossy ceramic
      kind: "tile",
      layout: "grid",
      color: "#f4f5f3",
      variation: 0.015,
      grout: "#dcdcd7",
      groutIn: 0.0625,
      roughness: 0.14,
      character: null,
    },
    "hd-308736405": {
      // Corso Italia Alpe Graphite 12x24 matte quartzite-look porcelain
      kind: "tile",
      layout: "offset",
      color: "#cfcecb",
      variation: 0.05,
      grout: "#b4b3af",
      groutIn: 0.125,
      roughness: 0.8,
      character: "stone",
    },
    "hd-313499026": {
      // Daltile LuxeCraft Arteko Antique White 3x12 glazed ceramic
      kind: "tile",
      layout: "offset",
      color: "#ece8e2",
      variation: 0.04,
      grout: "#d6d1c9",
      groutIn: 0.0625,
      roughness: 0.2,
      character: "handmade",
    },
    // --- flooring (vinyl plank) --------------------------------------------
    "hd-324087709": {
      // TrafficMaster Breaksea Island 6x36 vinyl plank, gray wood look
      kind: "plank",
      layout: "stagger",
      color: "#aca39b",
      accent: "#8f867d",
      variation: 0.08,
      grout: "#7d756d",
      groutIn: 0.03,
      roughness: 0.6,
      character: "wood",
    },
    "hd-309083456": {
      // Lifeproof Sterling Oak 8.7x48 luxury vinyl plank
      kind: "plank",
      layout: "stagger",
      color: "#a49b8d",
      accent: "#877e70",
      variation: 0.08,
      grout: "#756d61",
      groutIn: 0.03,
      roughness: 0.58,
      character: "wood",
    },
    "hd-338071457": {
      // Flooret Modin Nakan Craftsman 3.35x72 luxury vinyl plank, light oak
      kind: "plank",
      layout: "stagger",
      color: "#bfa485",
      accent: "#a0845f",
      variation: 0.07,
      grout: "#8a7255",
      groutIn: 0.03,
      roughness: 0.55,
      character: "wood",
    },
    // --- paint (all white / white-base products today) ---------------------
    "hd-100141333": { kind: "paint", color: "#f4f3ef", roughness: 0.92 }, // Glidden Maintenance, flat
    "hd-205853475": { kind: "paint", color: "#f6f5f1", roughness: 0.35 }, // BEHR PRO i100, semi-gloss
    "hd-206755810": { kind: "paint", color: "#f7f7f4", roughness: 0.35 }, // Glidden Premium, semi-gloss
    "hd-202246803": { kind: "paint", color: "#f5f5f2", roughness: 0.93 }, // Glidden ceiling, flat
    "hd-307298172": { kind: "paint", color: "#f7f7f5", roughness: 0.93 }, // Zinsser ceiling, flat bright white
    "hd-204805213": { kind: "paint", color: "#f5f5f2", roughness: 0.93 }, // Glidden Diamond ceiling, flat
  };

  // Which room surface each materials-picker category dresses, and which
  // scope answer has to be in effect for it to show there.
  var CATEGORY_SURFACE = {
    floorTile: { surface: "floor", scopeKey: "floorFinish", scopeValue: "tile" },
    flooring: { surface: "floor", scopeKey: "floorFinish", scopeValue: "flooring" },
    wallTile: { surface: "walls", scopeKey: "walls", scopeValue: "tile" },
    wallPaint: { surface: "walls", scopeKey: "walls", scopeValue: "paint" },
    ceilingPaint: { surface: "ceiling", scopeKey: "paintCeiling", scopeValue: true },
  };

  // "4-1/4" -> 4.25, "8.7" -> 8.7, "3" -> 3
  function parseInches(text) {
    var m = /^(\d+(?:\.\d+)?)(?:-(\d+)\/(\d+))?$/.exec(text);
    if (!m) return null;
    var value = Number(m[1]);
    if (m[2]) value += Number(m[2]) / Number(m[3]);
    return value;
  }

  // Pulls one tile/plank's face size out of a retail product name, e.g.
  //   "... 12 in. x 24 in. Matte Ceramic ..."        -> [12, 24]
  //   "... 4-1/4 in. x 4-1/4 in. Ceramic ..."         -> [4.25, 4.25]
  //   "... 22 MIL x 8.7 in. W x 48 in. L Click ..."   -> [8.7, 48]
  //   "... 40 MIL x 3.35 in x 72 in Waterproof ..."   -> [3.35, 72]
  // Returns null when no "<n> in x <n> in" pair is present.
  function parseUnitSizeIn(name) {
    if (!name) return null;
    var num = "(\\d+(?:\\.\\d+)?(?:-\\d+\\/\\d+)?)";
    var re = new RegExp(num + "\\s*in\\.?\\s*(?:(?:W|L)\\s*)?x\\s*" + num + "\\s*in\\b", "i");
    var m = re.exec(name);
    if (!m) return null;
    var w = parseInches(m[1]);
    var h = parseInches(m[2]);
    if (!(w > 0) || !(h > 0)) return null;
    return [w, h];
  }

  // The full spec for a picked product, with sizeIn filled in from its name
  // when the hand-authored spec doesn't set one. null when this product has
  // no surface spec (the preview then keeps its generic finish color).
  function specFor(product) {
    if (!product || !SPECS[product.id]) return null;
    var base = SPECS[product.id];
    var spec = {};
    Object.keys(base).forEach(function (k) {
      spec[k] = base[k];
    });
    spec.id = product.id;
    if (spec.kind !== "paint" && !spec.sizeIn) {
      spec.sizeIn = parseUnitSizeIn(product.name) || [12, 12];
    }
    return spec;
  }

  // Given the room's scope answers and the picks made so far
  // ({ categoryKey: spec }), returns which spec (or null) dresses each
  // surface right now. A pick only shows while its scope answer still
  // applies — picking a wall tile and then switching walls to "Paint"
  // falls back to the paint pick (or the generic paint color).
  function resolveSurfaces(scope, picks) {
    var out = { floor: null, walls: null, ceiling: null };
    Object.keys(CATEGORY_SURFACE).forEach(function (categoryKey) {
      var rule = CATEGORY_SURFACE[categoryKey];
      var spec = picks && picks[categoryKey];
      if (spec && scope && scope[rule.scopeKey] === rule.scopeValue) out[rule.surface] = spec;
    });
    return out;
  }

  return {
    SPECS: SPECS,
    CATEGORY_SURFACE: CATEGORY_SURFACE,
    parseUnitSizeIn: parseUnitSizeIn,
    specFor: specFor,
    resolveSurfaces: resolveSurfaces,
  };
});
