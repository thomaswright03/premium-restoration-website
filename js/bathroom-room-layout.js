// Pure logic for the 3D bathroom room preview: given the current scope
// answers, dimension inputs, and fixture counts, decide the room's
// dimensions, its finish colors/textures, and a deterministic layout of
// fixture stand-ins. No DOM, no Three.js — js/bathroom-room-3d.js owns all
// rendering; this module only ever returns plain data.
//
// The layout algorithm is a deterministic scan around the room's walls
// (not a substitute for an actual code review). It checks real clearance:
// every fixture's footprint plus its side clearance must stay out of every
// other fixture's footprint and clear floor space in front (CLEARANCE_IN),
// on any wall, so fixtures on adjacent walls can't clip into a shared
// corner. Clear floor spaces may overlap each other, as codes allow. When
// the usual first-fit leaves a fixture out, it slides fixtures along walls
// and tries other starting walls before giving up (see computeLayout).
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
  var MAX_FOOTPRINT_FT = 20; // cap on computeLayout({ footprints }) overrides
  var MAX_SEARCHED_FIXTURES = 6; // see the full search at the end of the wall scan
  var MAX_SEARCH_TRIES = 256; // every choice for 4 fixtures
  var SLIDE_STEP_FT = 0.25;

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
    // Bathtub and sink footprints match the real product models the 3D
    // preview loads (models/fixtures/, see FIXTURE_MODELS in
    // js/bathroom-room-3d.js): a 60x34 in. tub and a 22.5x18 in. wall-hung sink.
    // The tub takes exactly 60 in. of wall, so it fills a standard 5 ft alcove.
    Bathtub_Quantity: { wallSpan: 5, depth: 2.9, height: 1.6, mount: "floor" },
    Shower_Quantity: { wallSpan: 3.2, depth: 3.2, height: 6.5, mount: "floor" },
    Shower_Door_Quantity: { wallSpan: 2.5, depth: 0.1, height: 6.5, mount: "attach", attachTo: "Shower_Quantity" },
    Vanity_Quantity: { wallSpan: 2.5, depth: 1.6, height: 2.6, mount: "floor" },
    Sink_Quantity: { wallSpan: 1.9, depth: 1.55, height: 2.6, mount: "floor" },
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

  // Representative residential code-minimum clearances, in inches — typical
  // values, not a substitute for an actual code review (same spirit as the
  // rest of this preview). side: how far from the fixture's own centerline
  // (toilet) or edge (everything else) must stay clear of any obstruction
  // on either side, along the wall. front: clear floor space required in
  // front of the fixture, beyond its own physical depth, so a person can
  // actually use it (includes shower/door swing clearance). Wall-mounted
  // fixtures (mirrors, shelf) and attached ones (shower door) need no
  // floor-clearance entry — they don't independently consume floor space.
  var CLEARANCE_IN = {
    Toilet_Quantity: { side: 15, front: 21 },
    Sink_Quantity: { side: 4, front: 21 },
    Bathtub_Quantity: { side: 0, front: 21 },
    Shower_Quantity: { side: 0, front: 24 },
    Vanity_Quantity: { side: 3, front: 21 },
    Cabinet_Quantity: { side: 2, front: 12 },
    Door_Quantity: { side: 0, front: 24 },
  };

  function clearanceFt(fixtureKey) {
    var c = CLEARANCE_IN[fixtureKey] || { side: 0, front: 0 };
    return { side: c.side / 12, front: c.front / 12 };
  }

  // Fixtures that need to be on a wall carrying the plumbing stack. Kept
  // local (not read from js/bathroom-pricing.js's needsPlumbing flags) so
  // this module keeps its existing no-cross-file-dependency convention.
  // A vanity carries a sink, so it needs the stack as much as a pedestal
  // sink does.
  var PLUMBING_FIXTURE_KEYS = [
    "Toilet_Quantity",
    "Sink_Quantity",
    "Vanity_Quantity",
    "Bathtub_Quantity",
    "Shower_Quantity",
  ];

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
  // into (x, z, rotationY), plus its inward-facing normal (normalX/normalZ)
  // for projecting a fixture's depth+front-clearance into the room. "used"
  // tracks how much of the wall's span is already spoken for during one
  // computeLayout() call.
  function wallsFor(widthFt, lengthFt) {
    return [
      {
        id: "N",
        originX: 0,
        originZ: 0,
        dirX: 1,
        dirZ: 0,
        normalX: 0,
        normalZ: 1,
        span: widthFt,
        // How far the room actually extends in this wall's inward
        // direction — a fixture's depth+clearance can never exceed this,
        // or it would poke through the opposite wall.
        roomDepth: lengthFt,
        facingY: 0,
        used: 0,
      },
      {
        id: "E",
        originX: widthFt,
        originZ: 0,
        dirX: 0,
        dirZ: 1,
        normalX: -1,
        normalZ: 0,
        span: lengthFt,
        roomDepth: widthFt,
        facingY: -Math.PI / 2,
        used: 0,
      },
      {
        id: "S",
        originX: widthFt,
        originZ: lengthFt,
        dirX: -1,
        dirZ: 0,
        normalX: 0,
        normalZ: -1,
        span: widthFt,
        roomDepth: lengthFt,
        facingY: Math.PI,
        used: 0,
      },
      {
        id: "W",
        originX: 0,
        originZ: lengthFt,
        dirX: 0,
        dirZ: -1,
        normalX: 1,
        normalZ: 0,
        span: lengthFt,
        roomDepth: widthFt,
        facingY: Math.PI / 2,
        used: 0,
      },
    ];
  }

  // Half-width of the clearance envelope a fixture needs along its wall:
  // its own physical half-width, or its code-required side clearance,
  // whichever is larger (e.g. a toilet's 15in centerline clearance exceeds
  // half its ~20in physical width, so the clearance rule dominates).
  function expandedHalfWidth(footprint, fixtureKey) {
    return Math.max(footprint.wallSpan / 2, clearanceFt(fixtureKey).side);
  }

  // The world-space axis-aligned rectangle a fixture's clearance envelope
  // occupies: centered on `alongOffset` along the wall (±halfWidth), and
  // from the wall (0) to `depthExtent` into the room along the wall's
  // normal. Every wall is axis-aligned in this room's coordinate system
  // (tangent and normal are each purely X or purely Z), so this is always
  // a real axis-aligned rectangle, never a rotated one.
  function clearanceRect(wall, alongOffset, halfWidth, depthExtent) {
    var cx = wall.originX + wall.dirX * alongOffset;
    var cz = wall.originZ + wall.dirZ * alongOffset;
    var halfX = Math.abs(wall.dirX) * halfWidth;
    var halfZ = Math.abs(wall.dirZ) * halfWidth;
    var depthX = Math.abs(wall.normalX) * depthExtent;
    var depthZ = Math.abs(wall.normalZ) * depthExtent;
    return {
      minX: cx - halfX - (wall.normalX < 0 ? depthX : 0),
      maxX: cx + halfX + (wall.normalX > 0 ? depthX : 0),
      minZ: cz - halfZ - (wall.normalZ < 0 ? depthZ : 0),
      maxZ: cz + halfZ + (wall.normalZ > 0 ? depthZ : 0),
    };
  }

  // Rectangles that only touch don't overlap. EPS absorbs floating-point
  // error: a fixture packed right after another starts at a sum like
  // 1.25 + 1.25 + 2.6 - 2.6, which can land a hair before the first one's
  // edge (2.4999999999999996 vs 2.5) and would otherwise count as a
  // collision, dropping a fixture from a wall with plenty of room.
  var OVERLAP_EPS_FT = 1e-6;

  function rectsOverlap(a, b) {
    return (
      a.minX < b.maxX - OVERLAP_EPS_FT &&
      a.maxX > b.minX + OVERLAP_EPS_FT &&
      a.minZ < b.maxZ - OVERLAP_EPS_FT &&
      a.maxZ > b.minZ + OVERLAP_EPS_FT
    );
  }

  // Each fixture's envelope: `body` (the fixture plus its side clearance)
  // and `full` (body plus the clear floor space in front of it). Clear floor
  // spaces may share floor with each other, as codes allow (the space in
  // front of a toilet and the tub's can be the same floor), but nothing may
  // stand in another fixture's body or clear floor space. Two exceptions:
  // - A doorway: other fixtures' clear floor space may reach it, as long as
  //   nothing stands in its swing.
  // - A tub (CLEAR_WIDTH_IN): it only needs a 30 in. wide stretch of clear
  //   floor somewhere along its front, not the whole length, so a toilet can
  //   sit beside it the way it does in a standard 5x8 ft bathroom. `zones`
  //   are the candidate stretches; at least one must stay clear.
  var CLEAR_WIDTH_IN = { Bathtub_Quantity: 30 };
  var CLEAR_ZONE_STEPS = 5;

  function envelopeAt(fixtureKey, footprint, wall, alongOffset, halfWidth, depthExtent) {
    var env = {
      body: clearanceRect(wall, alongOffset, halfWidth, footprint.depth),
      full: clearanceRect(wall, alongOffset, halfWidth, depthExtent),
      isDoor: fixtureKey === "Door_Quantity",
    };
    var zoneHalf = (CLEAR_WIDTH_IN[fixtureKey] || 0) / 24;
    if (zoneHalf && zoneHalf < halfWidth) {
      env.full = env.body;
      env.zones = [];
      for (var k = 0; k < CLEAR_ZONE_STEPS; k++) {
        var center = alongOffset - halfWidth + zoneHalf + (2 * (halfWidth - zoneHalf) * k) / (CLEAR_ZONE_STEPS - 1);
        env.zones.push(clearanceRect(wall, center, zoneHalf, depthExtent));
      }
    }
    return env;
  }

  function zonesLeft(zones, bodies) {
    return zones.filter(function (z) {
      return !bodies.some(function (b) {
        return rectsOverlap(z, b);
      });
    });
  }

  function bodiesOf(placed) {
    return placed
      .filter(function (p) {
        return !p.isDoor;
      })
      .map(function (p) {
        return p.body;
      });
  }

  // Whether placed envelope `p` alone rules out `env`.
  function blocks(p, env) {
    if (env.isDoor && p.isDoor) return rectsOverlap(env.full, p.full);
    if (rectsOverlap(env.body, p.body)) return true;
    if (!env.isDoor) {
      if (p.zones ? !zonesLeft(p.zones, [env.body]).length : rectsOverlap(env.body, p.full)) return true;
    }
    return !p.isDoor && !env.zones && rectsOverlap(env.full, p.body);
  }

  function conflictsWithPlaced(placed, env) {
    if (
      placed.some(function (p) {
        return blocks(p, env);
      })
    ) {
      return true;
    }
    return !!env.zones && !zonesLeft(env.zones, bodiesOf(placed)).length;
  }

  // The placed list with `env` added, each tub keeping only the clear
  // stretches nothing stands in.
  function withPlaced(placed, env) {
    var out = placed.map(function (p) {
      if (!p.zones || env.isDoor) return p;
      return Object.assign({}, p, { zones: zonesLeft(p.zones, [env.body]) });
    });
    if (env.zones) env = Object.assign({}, env, { zones: zonesLeft(env.zones, bodiesOf(placed)) });
    out.push(env);
    return out;
  }

  // Where along `wall` a rectangle's along-wall extent ends, so a fixture
  // blocked by it can be slid to start right after it.
  function alongEnd(wall, r) {
    if (wall.dirX !== 0) {
      return Math.max((r.minX - wall.originX) * wall.dirX, (r.maxX - wall.originX) * wall.dirX);
    }
    return Math.max((r.minZ - wall.originZ) * wall.dirZ, (r.maxZ - wall.originZ) * wall.dirZ);
  }

  function placeAt(wall, alongOffset, footprint) {
    return {
      x: wall.originX + wall.dirX * alongOffset,
      z: wall.originZ + wall.dirZ * alongOffset,
      y: footprint.height / 2,
      rotationY: wall.facingY,
      wallId: wall.id,
    };
  }

  // Half-width of an entry point's clearance envelope, exposed so the 3D
  // module can clamp its nudge-left/right UI to a wall's real span without
  // needing to know FIXTURE_LAYOUT/CLEARANCE_IN internals itself.
  function entryPointHalfWidth() {
    return expandedHalfWidth(FIXTURE_LAYOUT.Door_Quantity, "Door_Quantity");
  }

  // Clamps an entry point's along-wall offset so its clearance envelope
  // stays on the wall. Mirrors how automatic wall-scan placement is always
  // kept on-wall by construction; entry points are user-positioned, so this
  // is the equivalent guard for them.
  function clampEntryOffset(wallSpanFt, offsetFt) {
    var halfWidth = entryPointHalfWidth();
    var maxOffset = Math.max(halfWidth, wallSpanFt - halfWidth);
    return clamp(offsetFt, halfWidth, maxOffset);
  }

  // Deterministic, pure: the same (widthFt, lengthFt, fixtureCounts) triple
  // always produces byte-identical placements. No Math.random, no
  // object-iteration-order dependence.
  function computeLayout(input) {
    input = input || {};
    // parseNumber (not `||`) so a truthy-but-non-numeric value (an object,
    // array, or garbage string someone passes this pure function directly
    // — `||` only catches falsy values, not those) can't reach the
    // arithmetic below and silently produce NaN/string-concatenated
    // coordinates; still clamped to the same render bounds
    // applyDimensionInput already holds the live-preview path to, so
    // calling this directly with an out-of-range value behaves the same
    // way as going through the normal input path.
    var parsedWidth = parseNumber(input.widthFt);
    var parsedLength = parseNumber(input.lengthFt);
    var widthFt =
      parsedWidth === null ? DEFAULT_ROOM.widthFt : clamp(parsedWidth, RENDER_MIN_DIM, DIMENSION_BOUNDS.widthFt);
    var lengthFt =
      parsedLength === null ? DEFAULT_ROOM.lengthFt : clamp(parsedLength, RENDER_MIN_DIM, DIMENSION_BOUNDS.lengthFt);
    var fixtureCounts = input.fixtureCounts || {};
    // Wall ids restricting the plumbing-needing fixtures (empty/omitted =
    // unrestricted, today's behavior). Multiple walls can carry the stack.
    var plumbingWallIds = Array.isArray(input.plumbingWallIds) ? input.plumbingWallIds : null;
    // Customer-picked entry points, each {wallId, offsetFt, hasDoor}. When
    // given, these REPLACE the automatic Door_Quantity wall-scan entirely —
    // still validated through the same clearance/overlap/room-boundary
    // checks as every other placement, so an entry point that would
    // conflict is dropped just like any other fixture that doesn't fit.
    var explicitEntryPoints =
      Array.isArray(input.entryPoints) && input.entryPoints.length > 0 ? input.entryPoints : null;
    // Per-fixture size overrides ({ fixtureKey: { wallSpan, depth, height } })
    // for when the 3D preview shows a specific product whose real size
    // differs from the default footprint — e.g. a 72 in. tub. Anything
    // not a positive number is ignored, keeping the default.
    var footprintOverrides = input.footprints && typeof input.footprints === "object" ? input.footprints : {};
    function footprintFor(fixtureKey) {
      var base = FIXTURE_LAYOUT[fixtureKey];
      var override = Object.prototype.hasOwnProperty.call(footprintOverrides, fixtureKey)
        ? footprintOverrides[fixtureKey]
        : null;
      if (!override || typeof override !== "object") return base;
      var merged = Object.assign({}, base);
      ["wallSpan", "depth", "height"].forEach(function (dim) {
        var n = parseNumber(override[dim]);
        if (n !== null && n > 0) merged[dim] = clamp(n, 0.1, MAX_FOOTPRINT_FT);
      });
      return merged;
    }
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

    // Pass 1: floor-standing fixtures. placedRects accumulates every placed
    // fixture's clearance envelope, checked against every NEW candidate
    // regardless of which wall either one is on — this is what catches a
    // fixture on an adjacent wall that would clip into a shared corner,
    // which a same-wall-only check (the old wallFits()) could not.
    var placedRects = [];

    // Reserved first (before the automatic scan below) so auto-placed
    // fixtures never land on top of a door the customer explicitly
    // positioned — the same way a wall itself is a fixed constraint.
    if (explicitEntryPoints) {
      var doorFootprint = FIXTURE_LAYOUT.Door_Quantity;
      var doorClearance = clearanceFt("Door_Quantity");
      var doorHalfWidth = expandedHalfWidth(doorFootprint, "Door_Quantity");
      placedByType.Door_Quantity = [];
      explicitEntryPoints.forEach(function (ep, i) {
        if (!ep) {
          droppedCounts.Door_Quantity = (droppedCounts.Door_Quantity || 0) + 1;
          return;
        }
        var wall = wallByIdOrder([ep.wallId])[0];
        if (!wall) {
          droppedCounts.Door_Quantity = (droppedCounts.Door_Quantity || 0) + 1;
          return;
        }
        if (wall.span < 2 * doorHalfWidth) {
          droppedCounts.Door_Quantity = (droppedCounts.Door_Quantity || 0) + 1;
          return;
        }
        var depthExtent = doorFootprint.depth + doorClearance.front;
        if (depthExtent > wall.roomDepth) {
          droppedCounts.Door_Quantity = (droppedCounts.Door_Quantity || 0) + 1;
          return;
        }
        // isFinite (not just != null) — a non-numeric or NaN offsetFt must
        // fall back to the same safe default as a missing one, not
        // propagate NaN through clampEntryOffset into every downstream
        // coordinate.
        var rawOffset = typeof ep.offsetFt === "number" && isFinite(ep.offsetFt) ? ep.offsetFt : wall.span / 2;
        var alongOffset = clampEntryOffset(wall.span, rawOffset);
        var doorEnv = envelopeAt("Door_Quantity", doorFootprint, wall, alongOffset, doorHalfWidth, depthExtent);
        if (conflictsWithPlaced(placedRects, doorEnv)) {
          droppedCounts.Door_Quantity = (droppedCounts.Door_Quantity || 0) + 1;
          return;
        }
        var placement = placeAt(wall, alongOffset, doorFootprint);
        placement.fixtureKey = "Door_Quantity";
        placement.index = i;
        placement.hasDoor = ep.hasDoor !== false;
        // Deliberately NOT touching wall.used here. wall.used is a
        // left-to-right packing cursor for the automatic scan below, which
        // always tries a fixture at exactly wall.used + halfWidth — it
        // assumes everything before that point is occupied. A customer's
        // explicit entry point can land anywhere on the wall (here, well
        // past its start), and treating everything before it as "used"
        // wrongly claims real free floor space the automatic scan could
        // still use. The actual conflict-avoidance is placedRects/
        // rectsOverlap below, which checks real overlap regardless of
        // wall.used and already covers this correctly.
        placedRects = withPlaced(placedRects, doorEnv);
        placements.push(placement);
        placedByType.Door_Quantity.push(placement);
      });
    }

    // Fixtures the customer dragged to a spot in the 3D preview
    // (input.fixturePositions: { fixtureKey: { index: { wallId, offsetFt } } }),
    // reserved next — before the automatic scan, like entry points — and
    // held to the same plumbing-wall, fit and clearance rules. A position
    // that no longer works (the room shrank, the wall lost its plumbing)
    // is ignored and that fixture is placed automatically instead.
    var fixturePositions =
      input.fixturePositions && typeof input.fixturePositions === "object" ? input.fixturePositions : {};
    var reserved = {}; // fixtureKey -> { index: placement }
    FLOOR_PRIORITY.forEach(function (fixtureKey) {
      if (fixtureKey === "Door_Quantity") return;
      var positions = fixturePositions[fixtureKey];
      if (!positions || typeof positions !== "object") return;
      var footprint = footprintFor(fixtureKey);
      var halfWidth = expandedHalfWidth(footprint, fixtureKey);
      var depthExtent = footprint.depth + clearanceFt(fixtureKey).front;
      var parsedCount = parseNumber(fixtureCounts[fixtureKey]);
      var count = clamp(Math.floor(parsedCount === null ? 0 : parsedCount), 0, MAX_FIXTURE_COUNT);
      var isPlumbing = plumbingWallIds && plumbingWallIds.length && PLUMBING_FIXTURE_KEYS.indexOf(fixtureKey) !== -1;
      reserved[fixtureKey] = {};
      for (var i = 0; i < count; i++) {
        var pos = positions[i];
        if (!pos || typeof pos.offsetFt !== "number" || !isFinite(pos.offsetFt)) continue;
        var wall = wallByIdOrder([pos.wallId])[0];
        if (!wall || wall.span < 2 * halfWidth || depthExtent > wall.roomDepth) continue;
        if (isPlumbing && plumbingWallIds.indexOf(wall.id) === -1) continue;
        var alongOffset = clamp(pos.offsetFt, halfWidth, wall.span - halfWidth);
        var env = envelopeAt(fixtureKey, footprint, wall, alongOffset, halfWidth, depthExtent);
        if (conflictsWithPlaced(placedRects, env)) continue;
        var placement = placeAt(wall, alongOffset, footprint);
        placement.fixtureKey = fixtureKey;
        placement.index = i;
        placement.offsetFt = alongOffset;
        placement.moved = true;
        placedRects = withPlaced(placedRects, env);
        reserved[fixtureKey][i] = placement;
      }
    });

    // The automatic wall scan, placing fixture types in `order`. `shift`
    // rotates which wall every fixture type starts from; shift 0 is the
    // long-standing layout, the others are only tried when it leaves
    // something out (see below). `startWalls`, when given, instead names the
    // wall (an index into N, E, S, W) each automatically placed fixture
    // tries first, in placement order.
    function autoPlace(shift, order, startWalls) {
      var autoIdx = 0;
      var walls = wallsFor(widthFt, lengthFt);
      var rects = placedRects.slice();
      var out = placements.slice();
      var dropped = Object.assign({}, droppedCounts);
      var byType = {};
      Object.keys(placedByType).forEach(function (k) {
        byType[k] = placedByType[k].slice();
      });
      var droppedTotal = 0;

      function scanOrder(priorityIdx, instanceIdx) {
        var start = startWalls ? startWalls[autoIdx] || 0 : (priorityIdx + instanceIdx + shift) % walls.length;
        return walls.slice(start).concat(walls.slice(0, start));
      }

      order.forEach(function (fixtureKey) {
        var priorityIdx = FLOOR_PRIORITY.indexOf(fixtureKey);
        // Handled above instead, when the customer picked explicit points.
        if (fixtureKey === "Door_Quantity" && explicitEntryPoints) return;
        var footprint = footprintFor(fixtureKey);
        var clearance = clearanceFt(fixtureKey);
        var halfWidth = expandedHalfWidth(footprint, fixtureKey);
        var requiredSpan = 2 * halfWidth;
        var depthExtent = footprint.depth + clearance.front;
        var parsedCount = parseNumber(fixtureCounts[fixtureKey]);
        var count = clamp(Math.floor(parsedCount === null ? 0 : parsedCount), 0, MAX_FIXTURE_COUNT);
        byType[fixtureKey] = [];
        var isPlumbing = plumbingWallIds && plumbingWallIds.length && PLUMBING_FIXTURE_KEYS.indexOf(fixtureKey) !== -1;

        function fitsAt(wall, alongOffset) {
          var env = envelopeAt(fixtureKey, footprint, wall, alongOffset, halfWidth, depthExtent);
          return conflictsWithPlaced(rects, env) ? null : env;
        }

        for (var i = 0; i < count; i++) {
          var moved = reserved[fixtureKey] && reserved[fixtureKey][i];
          if (moved) {
            out.push(moved);
            byType[fixtureKey].push(moved);
            continue;
          }
          var candidateWalls = scanOrder(priorityIdx, i);
          autoIdx++;
          if (footprint.preferWall) {
            var preferred = walls.filter(function (w) {
              return w.id === footprint.preferWall;
            })[0];
            if (preferred && preferred.used === 0) candidateWalls = [preferred];
          }
          if (isPlumbing) {
            candidateWalls = candidateWalls.filter(function (w) {
              return plumbingWallIds.indexOf(w.id) !== -1;
            });
          }
          candidateWalls = candidateWalls.filter(function (w) {
            // depthExtent > roomDepth would poke through the opposite wall.
            return w.span - w.used >= requiredSpan - OVERLAP_EPS_FT && depthExtent <= w.roomDepth;
          });
          var chosen = null;
          var chosenRects = null;
          var chosenOffset = 0;
          // First each wall's next free spot, as always; then, if none
          // works, slide along each wall past whatever is in the way.
          for (var w = 0; w < candidateWalls.length && !chosen; w++) {
            var at = candidateWalls[w].used + halfWidth;
            var fit = fitsAt(candidateWalls[w], at);
            if (fit) {
              chosen = candidateWalls[w];
              chosenRects = fit;
              chosenOffset = at;
            }
          }
          for (var w2 = 0; w2 < candidateWalls.length && !chosen; w2++) {
            var wall = candidateWalls[w2];
            var offset = wall.used + halfWidth;
            for (var step = 0; step < 100 && offset + halfWidth <= wall.span + OVERLAP_EPS_FT; step++) {
              var env = fitsAt(wall, offset);
              if (env) {
                chosen = wall;
                chosenRects = env;
                chosenOffset = offset;
                break;
              }
              // Slide past whatever is in the way, or a quarter foot when
              // it's only a tub's clear stretch.
              var next = offset + SLIDE_STEP_FT;
              var probe = envelopeAt(fixtureKey, footprint, wall, offset, halfWidth, depthExtent);
              rects.forEach(function (r) {
                if (!blocks(r, probe)) return;
                var inWay = !probe.isDoor && !r.zones && rectsOverlap(probe.body, r.full) ? r.full : r.body;
                next = Math.max(next, alongEnd(wall, inWay) + halfWidth);
              });
              offset = next;
            }
          }
          if (!chosen) {
            dropped[fixtureKey] = (dropped[fixtureKey] || 0) + 1;
            droppedTotal++;
            continue;
          }
          var placement = placeAt(chosen, chosenOffset, footprint);
          placement.fixtureKey = fixtureKey;
          placement.index = i;
          placement.offsetFt = chosenOffset;
          chosen.used = chosenOffset + halfWidth;
          rects = withPlaced(rects, chosenRects);
          out.push(placement);
          byType[fixtureKey].push(placement);
        }
      });
      return { placements: out, droppedCounts: dropped, placedByType: byType, droppedTotal: droppedTotal };
    }

    // Tries the usual layout first. Only if it leaves a fixture out, it also
    // tries the other three starting walls, and placing the widest fixtures
    // first (a tub claims its end wall before a toilet takes the corner),
    // keeping whichever leaves out the fewest. Ties keep the earlier try, so
    // the result stays deterministic.
    var widestFirst = FLOOR_PRIORITY.slice().sort(function (a, b) {
      return (
        footprintFor(b).wallSpan - footprintFor(a).wallSpan || FLOOR_PRIORITY.indexOf(a) - FLOOR_PRIORITY.indexOf(b)
      );
    });
    var best = autoPlace(0, FLOOR_PRIORITY);
    [FLOOR_PRIORITY, widestFirst].forEach(function (order) {
      for (var shift = 0; shift < 4 && best.droppedTotal > 0; shift++) {
        var attempt = autoPlace(shift, order);
        if (attempt.droppedTotal < best.droppedTotal) best = attempt;
      }
    });
    // Exactly one fixture still left out (a near miss, not an overfull
    // room): for a typical bathroom (up to 6 fixtures placed automatically),
    // try choices of starting wall for each one, up to MAX_SEARCH_TRIES so
    // it stays quick while the customer types.
    var autoCount = 0;
    FLOOR_PRIORITY.forEach(function (fixtureKey) {
      if (fixtureKey === "Door_Quantity" && explicitEntryPoints) return;
      var parsed = parseNumber(fixtureCounts[fixtureKey]);
      var count = clamp(Math.floor(parsed === null ? 0 : parsed), 0, MAX_FIXTURE_COUNT);
      for (var i = 0; i < count; i++) {
        if (!(reserved[fixtureKey] && reserved[fixtureKey][i])) autoCount++;
      }
    });
    if (best.droppedTotal === 1 && autoCount <= MAX_SEARCHED_FIXTURES) {
      var combos = Math.min(Math.pow(4, autoCount), MAX_SEARCH_TRIES);
      for (var code = 0; code < combos && best.droppedTotal > 0; code++) {
        var startWalls = [];
        for (var digit = 0, rest = code; digit < autoCount; digit++, rest = Math.floor(rest / 4)) {
          startWalls.push(rest % 4);
        }
        var tried = autoPlace(0, widestFirst, startWalls);
        if (tried.droppedTotal < best.droppedTotal) best = tried;
      }
    }
    placements = best.placements;
    droppedCounts = best.droppedCounts;
    placedByType = best.placedByType;

    // Shower-door pairing: attaches to the shower instance of the same
    // index, offset outward from the shower's open face. Extra doors beyond
    // the placed-shower count are dropped; extra showers simply get none.
    var showerDoorFootprint = FIXTURE_LAYOUT.Shower_Door_Quantity;
    var showerDoorCount = clamp(Math.floor(fixtureCounts.Shower_Door_Quantity || 0), 0, MAX_FIXTURE_COUNT);
    var placedShowers = placedByType.Shower_Quantity || [];
    // The shower's own size, so a door follows a picked product's (see
    // footprints above) to its open edge.
    var showerFootprint = footprintFor("Shower_Quantity");
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
    // to their anchor fixture's placement order. One anchor holds at most
    // one attachment — an extra item beyond the anchor count is dropped
    // (droppedCounts), the same honest accounting every other fixture in
    // this file gets, rather than stacked exactly on top of the last
    // anchor's attachment where it would render fully overlapping/
    // z-fighting and checkFit() would still wrongly report it as fitting.
    // Anchors already holding something, across types: a mirror and a large
    // mirror never share one vanity (they'd sit in exactly the same spot).
    var usedAnchors = {};
    WALL_MOUNT_PRIORITY.forEach(function (fixtureKey) {
      var footprint = FIXTURE_LAYOUT[fixtureKey];
      var parsedCount = parseNumber(fixtureCounts[fixtureKey]);
      var count = clamp(Math.floor(parsedCount === null ? 0 : parsedCount), 0, MAX_FIXTURE_COUNT);
      var anchorPool = [];
      for (var a = 0; a < footprint.anchors.length; a++) {
        var pool = (placedByType[footprint.anchors[a]] || []).filter(function (p) {
          return !usedAnchors[p.fixtureKey + ":" + p.index];
        });
        if (pool.length) {
          anchorPool = pool;
          break;
        }
      }
      for (var i2 = 0; i2 < count; i2++) {
        if (i2 >= anchorPool.length) {
          droppedCounts[fixtureKey] = (droppedCounts[fixtureKey] || 0) + 1;
          continue;
        }
        var anchor = anchorPool[i2];
        usedAnchors[anchor.fixtureKey + ":" + anchor.index] = true;
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
    CLEARANCE_IN: CLEARANCE_IN,
    PLUMBING_FIXTURE_KEYS: PLUMBING_FIXTURE_KEYS,
    clampEntryOffset: clampEntryOffset,
    applyDimensionInput: applyDimensionInput,
    applyFixtureInput: applyFixtureInput,
    computeRoomDimensions: computeRoomDimensions,
    computeLayout: computeLayout,
    colorForFloorFinish: colorForFloorFinish,
    colorForWalls: colorForWalls,
    colorForCeiling: colorForCeiling,
  };
});
