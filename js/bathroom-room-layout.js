// Pure logic for the 3D bathroom room preview: given the current scope
// answers, dimension inputs, and fixture counts, decide the room's
// dimensions, its finish colors/textures, and a deterministic layout of
// fixture stand-ins. No DOM, no Three.js — js/bathroom-room-3d.js owns all
// rendering; this module only ever returns plain data.
//
// This is a stylized preview, not a real floor plan: the layout algorithm
// is a simple deterministic first-fit around the room's walls, not a
// plumbing-aware or code-compliant design.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BathroomRoomLayout = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Mirrors Pricing.DIMENSIONS defaults/max in js/bathroom-pricing.js — kept
  // as plain literals here so this module has no dependency on that file.
  var DEFAULT_ROOM = { widthFt: 8, lengthFt: 5, heightFt: 8 };
  var DIMENSION_BOUNDS = { widthFt: 50, lengthFt: 50, heightFt: 20 };
  var RENDER_MIN_DIM = 2; // floor for a sane, non-degenerate rendered room
  var MAX_FIXTURE_COUNT = 20; // mirrors Pricing.MAX_FIXTURE_COUNT

  // Per-fixture footprint, in feet, used by the layout algorithm below.
  // wallSpan: how much of a wall's length this fixture consumes.
  // depth: how far it projects from the wall into the room (unused by the
  // wall-scan itself, kept for the 3D module's own geometry sizing).
  // height: vertical size, floor fixtures only.
  // mount: "floor" (walks the wall scan), "attach" (rides along with
  // another floor fixture instance by index), or "wall" (attaches to a
  // placed floor fixture from its anchors list).
  var FIXTURE_LAYOUT = {
    // Real-world elongated-bowl toilet: ~20in wall clearance, ~28in front
    // projection (tank back to bowl front), ~30in to the tank lid.
    Toilet_Quantity: { wallSpan: 1.7, depth: 2.3, height: 2.5, mount: "floor" },
    Bathtub_Quantity: { wallSpan: 5.2, depth: 2.6, height: 1.6, mount: "floor" },
    Shower_Quantity: { wallSpan: 3.2, depth: 3.2, height: 6.5, mount: "floor" },
    Shower_Door_Quantity: { wallSpan: 2.5, depth: 0.1, height: 6.5, mount: "attach", attachTo: "Shower_Quantity" },
    Vanity_Quantity: { wallSpan: 2.5, depth: 1.6, height: 2.6, mount: "floor" },
    Sink_Quantity: { wallSpan: 1.0, depth: 0.8, height: 2.6, mount: "floor" },
    Cabinet_Quantity: { wallSpan: 1.6, depth: 1.4, height: 2.6, mount: "floor" },
    Door_Quantity: { wallSpan: 2.5, depth: 0.15, height: 6.75, mount: "floor", preferWall: "S" },
    Mirror_Quantity: {
      wallSpan: 2.0,
      depth: 0.06,
      height: 2.5,
      mount: "wall",
      anchors: ["Vanity_Quantity", "Sink_Quantity"],
      mountHeight: 3.2,
    },
    Mirror_Huge_Quantity: {
      wallSpan: 3.5,
      depth: 0.06,
      height: 4.0,
      mount: "wall",
      anchors: ["Vanity_Quantity", "Sink_Quantity"],
      mountHeight: 3.0,
    },
    Shower_Shelf_Quantity: {
      wallSpan: 0.8,
      depth: 0.2,
      height: 0.15,
      mount: "wall",
      anchors: ["Shower_Quantity"],
      mountHeight: 4.0,
    },
  };

  // Fixed priority order for the floor-standing wall scan. Each type scans
  // from its OWN fixed wall index (priorityIndex % 4), not a shared cursor
  // — so changing one fixture type's count never relocates an already
  // placed, unrelated fixture of a different type as long as that other
  // type's wall still has room. demolition/floorFinish/walls/paintCeiling
  // never enter this list: no purchasable/visual category for them, same
  // convention the materials picker already encodes.
  var FLOOR_PRIORITY = [
    "Toilet_Quantity",
    "Bathtub_Quantity",
    "Shower_Quantity",
    "Vanity_Quantity",
    "Sink_Quantity",
    "Cabinet_Quantity",
    "Door_Quantity",
  ];
  var WALL_MOUNT_PRIORITY = ["Mirror_Quantity", "Mirror_Huge_Quantity", "Shower_Shelf_Quantity"];
  var MARGIN = 0.35; // reserved gap before/after each placed item, in feet

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Parses a form value the same way the chat's fields do. Returns null for
  // blank/unparsable input so callers can tell "leave unchanged" apart from
  // "explicit zero".
  function parseNumber(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") return isFinite(value) ? value : null;
    var s = String(value).trim();
    if (s === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  // Pure reducer for a dimension field. A blank/unparsable rawValue leaves
  // prevDims[key] untouched — clearing a field mid-retype must not collapse
  // the room back to the default. A parsable value is clamped to a sane
  // render range. Returns a new object (does not mutate prevDims).
  function applyDimensionInput(prevDims, key, rawValue) {
    var next = {
      widthFt: prevDims && prevDims.widthFt != null ? prevDims.widthFt : null,
      lengthFt: prevDims && prevDims.lengthFt != null ? prevDims.lengthFt : null,
      heightFt: prevDims && prevDims.heightFt != null ? prevDims.heightFt : null,
    };
    var n = parseNumber(rawValue);
    if (n === null) return next;
    next[key] = clamp(n, RENDER_MIN_DIM, DIMENSION_BOUNDS[key]);
    return next;
  }

  // Pure reducer for a fixture-count field. Blank/unparsable/non-numeric
  // becomes 0 — matches the domain convention that blank and 0 both mean
  // "none" (js/bathroom-pricing.js's own validateJob treats them the same
  // way). Valid values clamp to [0, MAX_FIXTURE_COUNT].
  function applyFixtureInput(prevCounts, fixtureKey, rawValue) {
    var next = {};
    Object.keys(prevCounts || {}).forEach(function (k) {
      next[k] = prevCounts[k];
    });
    var n = parseNumber(rawValue);
    next[fixtureKey] = n === null ? 0 : clamp(Math.floor(n), 0, MAX_FIXTURE_COUNT);
    return next;
  }

  // Fills in the default footprint for any dimension not yet entered. This
  // is what lets the room render at 8x5x8 from the moment the estimate
  // starts, since the dimensions chat group is only asked when the chosen
  // scope needs floor/wall area (see scopeNeeds() in bathroom-pricing.js) —
  // a fixtures-only job never asks for width/length/height at all.
  function computeRoomDimensions(dims) {
    dims = dims || {};
    return {
      widthFt: dims.widthFt != null ? dims.widthFt : DEFAULT_ROOM.widthFt,
      lengthFt: dims.lengthFt != null ? dims.lengthFt : DEFAULT_ROOM.lengthFt,
      heightFt: dims.heightFt != null ? dims.heightFt : DEFAULT_ROOM.heightFt,
    };
  }

  // The 4 walls of a widthFt x lengthFt room, in a fixed order, each with a
  // start point/direction so a fixture's wall-local offset can be turned
  // into (x, z, rotationY). "used" tracks how much of the wall's span is
  // already spoken for during one computeLayout() call.
  function wallsFor(widthFt, lengthFt) {
    return [
      { id: "N", originX: 0, originZ: 0, dirX: 1, dirZ: 0, span: widthFt, facingY: 0, used: 0 },
      { id: "E", originX: widthFt, originZ: 0, dirX: 0, dirZ: 1, span: lengthFt, facingY: -Math.PI / 2, used: 0 },
      { id: "S", originX: widthFt, originZ: lengthFt, dirX: -1, dirZ: 0, span: widthFt, facingY: Math.PI, used: 0 },
      { id: "W", originX: 0, originZ: lengthFt, dirX: 0, dirZ: -1, span: lengthFt, facingY: Math.PI / 2, used: 0 },
    ];
  }

  function placeOnWall(wall, footprint) {
    var offset = wall.used + MARGIN + footprint.wallSpan / 2;
    return {
      x: wall.originX + wall.dirX * offset,
      z: wall.originZ + wall.dirZ * offset,
      y: footprint.height / 2,
      rotationY: wall.facingY,
      wallId: wall.id,
    };
  }

  function wallFits(wall, footprint) {
    return wall.span - wall.used >= footprint.wallSpan + 2 * MARGIN;
  }

  // Deterministic, pure: the same (widthFt, lengthFt, fixtureCounts) triple
  // always produces byte-identical placements. No Math.random, no
  // object-iteration-order dependence.
  function computeLayout(input) {
    input = input || {};
    var widthFt = input.widthFt || DEFAULT_ROOM.widthFt;
    var lengthFt = input.lengthFt || DEFAULT_ROOM.lengthFt;
    var fixtureCounts = input.fixtureCounts || {};
    var walls = wallsFor(widthFt, lengthFt);
    var placements = [];
    var droppedCounts = {};
    var placedByType = {}; // fixtureKey -> array of placements, in placement order

    function wallByIdOrder(order) {
      return order
        .map(function (id) {
          var found = null;
          walls.forEach(function (w) {
            if (w.id === id) found = w;
          });
          return found;
        })
        .filter(Boolean);
    }

    function scanOrderFor(priorityIdx, instanceIdx) {
      var start = (priorityIdx + instanceIdx) % walls.length;
      return walls.slice(start).concat(walls.slice(0, start));
    }

    // Pass 1: floor-standing fixtures.
    FLOOR_PRIORITY.forEach(function (fixtureKey, priorityIdx) {
      var footprint = FIXTURE_LAYOUT[fixtureKey];
      var count = clamp(Math.floor(fixtureCounts[fixtureKey] || 0), 0, MAX_FIXTURE_COUNT);
      placedByType[fixtureKey] = [];
      for (var i = 0; i < count; i++) {
        var candidateWalls = scanOrderFor(priorityIdx, i);
        if (footprint.preferWall) {
          var preferred = wallByIdOrder([footprint.preferWall])[0];
          if (preferred && preferred.used === 0) candidateWalls = [preferred];
        }
        var chosen = null;
        for (var w = 0; w < candidateWalls.length; w++) {
          if (wallFits(candidateWalls[w], footprint)) {
            chosen = candidateWalls[w];
            break;
          }
        }
        if (!chosen) {
          droppedCounts[fixtureKey] = (droppedCounts[fixtureKey] || 0) + 1;
          continue;
        }
        var placement = placeOnWall(chosen, footprint);
        placement.fixtureKey = fixtureKey;
        placement.index = i;
        chosen.used += footprint.wallSpan + MARGIN;
        placements.push(placement);
        placedByType[fixtureKey].push(placement);
      }
    });

    // Shower-door pairing: attaches to the shower instance of the same
    // index, offset outward from the shower's open face. Extra doors beyond
    // the placed-shower count are dropped; extra showers simply get none.
    var showerDoorFootprint = FIXTURE_LAYOUT.Shower_Door_Quantity;
    var showerDoorCount = clamp(Math.floor(fixtureCounts.Shower_Door_Quantity || 0), 0, MAX_FIXTURE_COUNT);
    var placedShowers = placedByType.Shower_Quantity || [];
    var showerFootprint = FIXTURE_LAYOUT.Shower_Quantity;
    for (var d = 0; d < showerDoorCount; d++) {
      var shower = placedShowers[d];
      if (!shower) {
        droppedCounts.Shower_Door_Quantity = (droppedCounts.Shower_Door_Quantity || 0) + 1;
        continue;
      }
      placements.push({
        fixtureKey: "Shower_Door_Quantity",
        index: d,
        x: shower.x,
        z: shower.z,
        y: showerDoorFootprint.height / 2,
        rotationY: shower.rotationY,
        wallId: shower.wallId,
        attachedTo: { fixtureKey: "Shower_Quantity", index: shower.index },
        // Full depth, not half: the shower's own origin sits at the wall
        // (z=0 in its local space), so the door — mounted at the shower's
        // OPEN, room-facing edge — needs the full depth offset, not the
        // midpoint.
        depthOffset: showerFootprint.depth,
      });
    }

    // Pass 2: wall-mounted attachments (mirrors, shower shelf), index-paired
    // to their anchor fixture's placement order, clamped to the last anchor
    // if there are more wall items than anchors.
    WALL_MOUNT_PRIORITY.forEach(function (fixtureKey) {
      var footprint = FIXTURE_LAYOUT[fixtureKey];
      var count = clamp(Math.floor(fixtureCounts[fixtureKey] || 0), 0, MAX_FIXTURE_COUNT);
      var anchorPool = [];
      for (var a = 0; a < footprint.anchors.length; a++) {
        var pool = placedByType[footprint.anchors[a]] || [];
        if (pool.length) {
          anchorPool = pool;
          break;
        }
      }
      for (var i2 = 0; i2 < count; i2++) {
        if (!anchorPool.length) {
          droppedCounts[fixtureKey] = (droppedCounts[fixtureKey] || 0) + 1;
          continue;
        }
        var anchor = anchorPool[Math.min(i2, anchorPool.length - 1)];
        placements.push({
          fixtureKey: fixtureKey,
          index: i2,
          x: anchor.x,
          z: anchor.z,
          y: footprint.mountHeight,
          rotationY: anchor.rotationY,
          wallId: anchor.wallId,
          attachedTo: { fixtureKey: anchor.fixtureKey, index: anchor.index },
        });
      }
    });

    return { placements: placements, droppedCounts: droppedCounts };
  }

  // Finish color/texture lookups. Colors are exact hex values from the
  // site's brand palette (css/style.css :root custom properties), resolved
  // separately for light/dark since Three.js materials need literal values.
  // demolition never influences any of these — same convention the
  // materials picker and the old bathroom-visualizer.js both already used.
  var FINISH_COLORS = {
    tile: { light: 0xffffff, dark: 0x1d1a16 },
    flooring: { light: 0xcda15f, dark: 0xe0b877 },
    floorNone: { light: 0xf3efe7, dark: 0x24201b },
    wallPaint: { light: 0xcda15f, dark: 0xe0b877 },
    wallNone: { light: 0xfaf8f4, dark: 0x14120f },
    ceilingPainted: { light: 0xcda15f, dark: 0xe0b877 },
    ceilingUnpainted: { light: 0xfaf8f4, dark: 0x14120f },
  };

  function textureKindForFloorFinish(value) {
    if (value === "tile") return "tile";
    if (value === "flooring") return "flooring";
    return null;
  }

  function textureKindForWalls(value) {
    return value === "tile" ? "tile" : null;
  }

  function colorForFloorFinish(value, isDark) {
    var shade = isDark ? "dark" : "light";
    if (value === "tile") return FINISH_COLORS.tile[shade];
    if (value === "flooring") return FINISH_COLORS.flooring[shade];
    return FINISH_COLORS.floorNone[shade];
  }

  function colorForWalls(value, isDark) {
    var shade = isDark ? "dark" : "light";
    if (value === "tile") return FINISH_COLORS.tile[shade];
    if (value === "paint") return FINISH_COLORS.wallPaint[shade];
    return FINISH_COLORS.wallNone[shade];
  }

  function colorForCeiling(paintCeilingBool, isDark) {
    var shade = isDark ? "dark" : "light";
    return paintCeilingBool === true ? FINISH_COLORS.ceilingPainted[shade] : FINISH_COLORS.ceilingUnpainted[shade];
  }

  return {
    DEFAULT_ROOM: DEFAULT_ROOM,
    DIMENSION_BOUNDS: DIMENSION_BOUNDS,
    RENDER_MIN_DIM: RENDER_MIN_DIM,
    MAX_FIXTURE_COUNT: MAX_FIXTURE_COUNT,
    FIXTURE_LAYOUT: FIXTURE_LAYOUT,
    applyDimensionInput: applyDimensionInput,
    applyFixtureInput: applyFixtureInput,
    computeRoomDimensions: computeRoomDimensions,
    computeLayout: computeLayout,
    textureKindForFloorFinish: textureKindForFloorFinish,
    textureKindForWalls: textureKindForWalls,
    colorForFloorFinish: colorForFloorFinish,
    colorForWalls: colorForWalls,
    colorForCeiling: colorForCeiling,
  };
});
