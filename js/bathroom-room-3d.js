// 3D bathroom room preview: an orbitable room, rendered as realistically as
// this pipeline reasonably allows — real-world proportions, PBR materials
// (glazed-porcelain clearcoat, chrome), image-based lighting, real shadows —
// built purely from the customer's entered width/length/height (or a
// sensible default before those are asked — see js/bathroom-room-layout.js
// computeRoomDimensions), and updating live as the chat estimate's
// scope/dimension/fixture fields are answered. Self-hosted Three.js
// (js/vendor/three/), no build step.
//
// This module is the only first-party file using ES module import/export
// (see eslint.config.js) — everything else on the page is a classic
// <script>. window.BathroomRoom3D is always a safe object to call: a
// WebGL failure (unsupported/disabled) is caught inside ensureScene() and
// never propagates into js/script.js's event handlers.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

var Layout = window.BathroomRoomLayout;

var PANEL_ID = "ai-chat-room-3d";
var CANVAS_WRAP_ID = "ai-chat-room-3d-canvas-wrap";

// Outward-normal wall specs for the shell (BackSide culling needs the
// normal pointing AWAY from the room interior, so whichever wall sits
// between the orbiting camera and the interior is the one that vanishes).
// This is deliberately the mirror image of js/bathroom-room-layout.js's
// wall.facingY, which orients FIXTURES to face INTO the room instead.
function shellWalls(widthFt, lengthFt) {
  return [
    { id: "N", spanFt: widthFt, rotY: Math.PI, x: widthFt / 2, z: 0 },
    { id: "E", spanFt: lengthFt, rotY: Math.PI / 2, x: widthFt, z: lengthFt / 2 },
    { id: "S", spanFt: widthFt, rotY: 0, x: widthFt / 2, z: lengthFt },
    { id: "W", spanFt: lengthFt, rotY: -Math.PI / 2, x: 0, z: lengthFt / 2 },
  ];
}

// Inward-facing normal per wall id — mirrors js/bathroom-room-layout.js's
// wallsFor() normalX/normalZ (kept as a small local literal here rather
// than importing that module's internals, matching this file's existing
// convention of duplicating the tiny bits of wall geometry it needs).
var WALL_INWARD_NORMAL = { N: { x: 0, z: 1 }, E: { x: -1, z: 0 }, S: { x: 0, z: -1 }, W: { x: 1, z: 0 } };

function wallSpanFor(wallId, widthFt, lengthFt) {
  return wallId === "N" || wallId === "S" ? widthFt : lengthFt;
}

// Which shared material (see buildMaterials()) represents a fixture type's
// primary visible finish — matched by reference identity against the
// already-built `mat` object, so none of the buildX() functions need any
// per-mesh tagging. Fixture types not listed here (currently just
// Shower_Quantity, whose finish signal — glass panels + a porcelain pan —
// isn't a meaningful single color to retint) simply never get tinted.
var FIXTURE_FINISH_MATERIAL_KEY = {
  Toilet_Quantity: "porcelainGloss",
  Sink_Quantity: "porcelain",
  Bathtub_Quantity: "porcelain",
  Shower_Door_Quantity: "brass",
  Door_Quantity: "doorTone",
  Vanity_Quantity: "cabinetWood",
  Cabinet_Quantity: "cabinetWood",
  Mirror_Quantity: "brass",
  Mirror_Huge_Quantity: "brass",
  Shower_Shelf_Quantity: "brass",
};

// Retints every mesh in `instance` using the fixture type's designated
// finish material (if any) toward `colorHex` — a single cloned material
// shared across every matching mesh within this one instance, so a
// toilet's bowl and tank (both porcelainGloss) get the same tinted clone
// rather than two separate ones.
function applyFixtureFinish(instance, fixtureKey, mat, colorHex) {
  var materialKey = FIXTURE_FINISH_MATERIAL_KEY[fixtureKey];
  var sharedMaterial = materialKey && mat[materialKey];
  if (!sharedMaterial) return;
  var tinted = null;
  instance.traverse(function (child) {
    if (child.isMesh && child.material === sharedMaterial) {
      if (!tinted) {
        tinted = sharedMaterial.clone();
        tinted.color.setHex(colorHex);
        // Marks this as a clone made just for this instance, as opposed to
        // every mesh still pointing at the shared, reused-forever template
        // material — rebuildFixtures() uses this to know which materials
        // it's safe (and necessary) to dispose() when a fixture is rebuilt.
        tinted.userData.isFinishClone = true;
      }
      child.material = tinted;
    }
  });
}

// Releases GPU resources (compiled shader program) for the one-off tinted
// material clones applyFixtureFinish() creates. The template's own shared
// geometries/materials (still referenced by every future template.clone())
// are deliberately left untouched.
function disposeFixtureInstance(instance) {
  instance.traverse(function (child) {
    if (child.isMesh && child.material && child.material.userData && child.material.userData.isFinishClone) {
      child.material.dispose();
    }
  });
}

// Retints every already-placed instance of fixtureKey in place — used by
// setFixtureFinish() so picking a product's finish doesn't have to pay for
// a full rebuildFixtures() (which recomputes the whole layout and
// re-instantiates every fixture in the room) just to change a color.
// colorHex null resets back to the shared, untinted material. Placement
// itself never depends on fixtureFinishes, so this never needs to touch
// Layout.computeLayout() at all.
function updateFixtureFinishInstances(s, fixtureKey, colorHex) {
  var materialKey = FIXTURE_FINISH_MATERIAL_KEY[fixtureKey];
  var sharedMaterial = materialKey && s.mat[materialKey];
  if (!sharedMaterial) return;
  s.fixtureGroup.children.forEach(function (instance) {
    if (instance.userData.fixtureKey !== fixtureKey) return;
    instance.traverse(function (child) {
      if (child.isMesh && child.material && child.material.userData && child.material.userData.isFinishClone) {
        child.material.dispose();
        child.material = sharedMaterial;
      }
    });
    if (colorHex != null) applyFixtureFinish(instance, fixtureKey, s.mat, colorHex);
  });
}

function isDarkTheme() {
  var attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ---------------------------------------------------------------------
// Realistic-geometry helpers (toilet, and reusable for later fixtures).
// ---------------------------------------------------------------------

// A THREE.LatheGeometry from a hand-placed (radius, height) side-profile,
// revolved around Y then stretched along Z — the standard, pragmatic way to
// turn a lathe's circular cross-section into a real fixture's elongated
// footprint without hand-lofting a full custom mesh.
function latheProfileGeometry(profilePoints, zScale, segments) {
  var pts = profilePoints.map(function (p) {
    return new THREE.Vector2(p[0], p[1]);
  });
  var geo = new THREE.LatheGeometry(pts, segments || 32);
  geo.scale(1, 1, zScale);
  geo.computeVertexNormals();
  return geo;
}

// A rounded-rectangle outline, y from 0 to height, centered on x — the
// front-face profile for roundedBoxGeometry below.
function roundedFrontShape(width, height, radius) {
  var w2 = width / 2;
  var r = Math.min(radius, w2, height / 2);
  var shape = new THREE.Shape();
  shape.moveTo(-w2 + r, 0);
  shape.lineTo(w2 - r, 0);
  shape.quadraticCurveTo(w2, 0, w2, r);
  shape.lineTo(w2, height - r);
  shape.quadraticCurveTo(w2, height, w2 - r, height);
  shape.lineTo(-w2 + r, height);
  shape.quadraticCurveTo(-w2, height, -w2, height - r);
  shape.lineTo(-w2, r);
  shape.quadraticCurveTo(-w2, 0, -w2 + r, 0);
  return shape;
}

// A soft-edged box (rounded corners + beveled top/bottom), extruded along Z
// so it lands directly in this file's fixture convention: x centered, y
// from 0 (floor) to height, z from 0 (at the wall) to depth (into the
// room) — e.g. a toilet tank/lid, no post-hoc rotation needed.
function roundedBoxGeometry(width, height, depth, cornerRadius, bevelSize) {
  var shape = roundedFrontShape(width, height, cornerRadius);
  var geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize: bevelSize,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.computeVertexNormals();
  return geo;
}

// An open horseshoe ring (a real toilet seat's shape, unlike a closed
// torus) — an ellipse swept by TubeGeometry, left open across a front gap.
// centerZ/frontZ locate the ellipse in this fixture's z=0-at-wall space.
function horseshoeSeatGeometry(radiusX, radiusZ, centerZ, tubeRadius, gapDegrees) {
  var gapHalf = (gapDegrees / 2) * (Math.PI / 180);
  var start = Math.PI / 2 + gapHalf;
  var end = Math.PI / 2 - gapHalf + Math.PI * 2;
  var steps = 40;
  var points = [];
  for (var i = 0; i <= steps; i++) {
    var theta = start + ((end - start) * i) / steps;
    points.push(new THREE.Vector3(radiusX * Math.cos(theta), 0, centerZ + radiusZ * Math.sin(theta)));
  }
  var curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
  var geo = new THREE.TubeGeometry(curve, 64, tubeRadius, 12, false);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------
// Fixture primitives: one shared geometry/material set built once, one
// template Group per fixture key built once, cloned cheaply (shared
// geometry/material references, not re-uploaded) for every placement.
// ---------------------------------------------------------------------
function buildMaterials(isDark) {
  var porcelain = new THREE.MeshLambertMaterial({ color: isDark ? 0x8a8377 : 0x6b6358 });
  var cabinetWood = new THREE.MeshLambertMaterial({ color: isDark ? 0x5c564c : 0x46413a });
  var doorTone = new THREE.MeshLambertMaterial({ color: isDark ? 0xa79c85 : 0xcfc3ad });
  var glass = new THREE.MeshLambertMaterial({ color: 0xdce6e6, transparent: true, opacity: 0.3 });
  var brass = new THREE.MeshStandardMaterial({
    color: isDark ? 0xcda15f : 0xb3874a,
    metalness: 0.6,
    roughness: 0.35,
  });
  // Glazed ceramic: a thin glossy clearcoat over a mostly-diffuse white
  // body is what actually reads as "porcelain" under image-based lighting,
  // rather than a flat white color.
  var porcelainGloss = new THREE.MeshPhysicalMaterial({
    color: isDark ? 0xe8e6df : 0xfdfcf9,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  // The seat/lid is a separate molded piece (resin or coated wood) — a
  // little less glossy than the ceramic bowl/tank, same family of material.
  var seatResin = new THREE.MeshPhysicalMaterial({
    color: isDark ? 0xe4e2db : 0xfbfaf6,
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
  });
  var chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd8dadb,
    roughness: 0.12,
    metalness: 1,
    clearcoat: 0.3,
  });
  return {
    porcelain: porcelain,
    cabinetWood: cabinetWood,
    doorTone: doorTone,
    glass: glass,
    brass: brass,
    porcelainGloss: porcelainGloss,
    seatResin: seatResin,
    chrome: chrome,
  };
}

// Side-profile (radius, height) of an elongated toilet bowl, floor to rim,
// bottom to top — a skirted column that narrows through a waist then
// flares to the rim, with a shallow visible interior just inside the lip.
// Revolved by latheProfileGeometry() and stretched in Z to go from a round
// lathe cross-section to a real elongated-bowl footprint.
var TOILET_BOWL_PROFILE = [
  [0.0, 0.0],
  [0.4, 0.0],
  [0.43, 0.08],
  [0.4, 0.25],
  [0.36, 0.55],
  [0.4, 0.85],
  [0.48, 1.05],
  [0.52, 1.18],
  [0.5, 1.27],
  [0.34, 1.3],
  [0.22, 1.28],
  [0.16, 1.1],
  [0.11, 0.85],
  [0.09, 0.68],
  [0.0, 0.62],
];
var TOILET_BOWL_Z_SCALE = 1.4;
var TOILET_SEAT_CENTER_Z = 0.85;

function buildToiletGeometries() {
  var bowl = latheProfileGeometry(TOILET_BOWL_PROFILE, TOILET_BOWL_Z_SCALE, 40);
  var seat = horseshoeSeatGeometry(0.48, 0.62 * TOILET_BOWL_Z_SCALE, TOILET_SEAT_CENTER_Z, 0.045, 70);
  var hingeStub = new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8);
  var flushLever = new THREE.CapsuleGeometry(0.022, 0.1, 4, 8);
  return {
    bowl: bowl,
    seat: seat,
    hingeStub: hingeStub,
    flushLever: flushLever,
    // Style A — skirted two-piece: boxier, visibly separate tank + lid.
    // Deep enough (z) to bury its back half in the bowl's own bulk at this
    // height range — the bowl profile ends at the rim (y=1.3), so without
    // real overlap the tank would visibly float above/behind it.
    tankA: roundedBoxGeometry(1.05, 1.3, 0.85, 0.1, 0.025),
    lidA: roundedBoxGeometry(1.15, 0.08, 0.9, 0.12, 0.02),
    // Style B — one-piece seamless: a rounder, lower, pill-like upper body
    // that overlaps down into the bowl instead of sitting apart from it.
    tankB: roundedBoxGeometry(0.95, 1.05, 0.85, 0.32, 0.03),
  };
}

function buildGeometries() {
  return {
    toilet: buildToiletGeometries(),
    sinkBasin: new THREE.CylinderGeometry(0.7, 0.6, 0.15, 16),
    sinkColumn: new THREE.CylinderGeometry(0.18, 0.22, 2.4, 12),
    bathtubOuter: new THREE.BoxGeometry(5.2, 1.6, 2.6),
    bathtubInner: new THREE.BoxGeometry(4.7, 1.1, 2.1),
    showerPanel: new THREE.PlaneGeometry(3.2, 6.5),
    showerPan: new THREE.BoxGeometry(3, 0.1, 3),
    showerHeadArm: new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8),
    showerHeadElbow: new THREE.SphereGeometry(0.035, 8, 8),
    showerHeadDisc: new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24),
    showerDoorPanel: new THREE.PlaneGeometry(2.5, 6.5),
    showerDoorFrameEdge: new THREE.BoxGeometry(0.06, 6.5, 0.06),
    doorSlab: new THREE.BoxGeometry(2.5, 6.75, 0.15),
    doorKnob: new THREE.SphereGeometry(0.05, 8, 8),
    doorFrameEdge: new THREE.BoxGeometry(0.06, 6.75, 0.06),
    vanityBody: new THREE.BoxGeometry(2.5, 2.6, 1.6),
    vanityBasin: new THREE.CylinderGeometry(0.55, 0.5, 0.12, 16),
    cabinetBody: new THREE.BoxGeometry(1.6, 2.6, 1.4),
    mirrorGlass: new THREE.PlaneGeometry(1.85, 2.35),
    mirrorFrameEdge: new THREE.BoxGeometry(0.06, 2.35, 0.06),
    mirrorHugeGlass: new THREE.PlaneGeometry(3.35, 3.85),
    mirrorHugeFrameEdge: new THREE.BoxGeometry(0.06, 3.85, 0.06),
    shelfBody: new THREE.BoxGeometry(0.8, 0.15, 0.2),
  };
}

function frameStrips(edgeGeometry, mat, width, height) {
  var group = new THREE.Group();
  var top = new THREE.Mesh(edgeGeometry, mat);
  top.rotation.z = Math.PI / 2;
  // edgeGeometry is a thin bar authored along its own local Y axis, length
  // `height` (its own vertical-edge length — see the *FrameEdge geometries
  // above, always built and called with the same value). Rotating 90° about
  // Z swaps local X/Y into world Y/X, so to land a `width`-long horizontal
  // bar the LENGTH axis (local Y) needs rescaling to `width` — scaling
  // local X instead (the bar's thin cross-section) leaves the unscaled
  // length axis, now `height` long, swapped onto world X: a slab roughly
  // `height` wide by `width` thick instead of a thin `width`-long strip.
  top.scale.set(1, width / height, 1);
  top.position.set(0, height / 2, 0);
  var bottom = top.clone();
  bottom.position.set(0, -height / 2, 0);
  var left = new THREE.Mesh(edgeGeometry, mat);
  left.position.set(-width / 2, 0, 0);
  var right = left.clone();
  right.position.set(width / 2, 0, 0);
  group.add(top, bottom, left, right);
  return group;
}

// Shared by both toilet styles: the bowl, seat, hinge stubs and flush
// lever are identical — only the tank/lid (and how they're attached to the
// bowl) tell the two styles apart.
function addToiletBowlAndSeat(g, geo, mat) {
  var bowl = new THREE.Mesh(geo.toilet.bowl, mat.porcelainGloss);
  bowl.position.set(0, 0, TOILET_SEAT_CENTER_Z);
  var seat = new THREE.Mesh(geo.toilet.seat, mat.seatResin);
  seat.position.set(0, 1.33, 0);
  var hingeR = new THREE.Mesh(geo.toilet.hingeStub, mat.seatResin);
  hingeR.rotation.z = Math.PI / 2;
  hingeR.position.set(0.09, 1.33, TOILET_SEAT_CENTER_Z - 0.62 * TOILET_BOWL_Z_SCALE + 0.04);
  var hingeL = hingeR.clone();
  hingeL.position.x = -0.09;
  g.add(bowl, seat, hingeR, hingeL);
}

function addFlushLever(g, geo, mat, x, y, z) {
  var lever = new THREE.Mesh(geo.toilet.flushLever, mat.chrome);
  lever.rotation.z = Math.PI / 2;
  lever.position.set(x, y, z);
  g.add(lever);
}

// Local origin sits on the wall (z=0); the fixture projects forward into
// the room as z increases, matching every other floor fixture builder in
// this file.

// Style A — skirted two-piece (elongated bowl, continuous floor-to-rim
// skirt hiding the trapway, a visibly separate compact tank + lid, chrome
// side lever). Reference: the first supplied toilet photo.
function buildToiletStyleA(geo, mat) {
  var g = new THREE.Group();
  addToiletBowlAndSeat(g, geo, mat);
  var tank = new THREE.Mesh(geo.toilet.tankA, mat.porcelainGloss);
  tank.position.set(0, 0.86, 0);
  var lid = new THREE.Mesh(geo.toilet.lidA, mat.porcelainGloss);
  lid.position.set(0, 2.2, -0.04);
  addFlushLever(g, geo, mat, 0.545, 1.75, 0.65);
  g.add(tank, lid);
  return g;
}

// Style B — one-piece seamless (bowl and a rounder, lower "pill" upper
// body overlapped into one continuous glossy form — no separate lid seam).
// Reference: the third supplied toilet photo.
function buildToiletStyleB(geo, mat) {
  var g = new THREE.Group();
  addToiletBowlAndSeat(g, geo, mat);
  var tank = new THREE.Mesh(geo.toilet.tankB, mat.porcelainGloss);
  tank.position.set(0, 0.75, 0.04);
  addFlushLever(g, geo, mat, 0.5, 1.45, 0.6);
  g.add(tank);
  return g;
}

function buildSink(geo, mat) {
  var g = new THREE.Group();
  var basin = new THREE.Mesh(geo.sinkBasin, mat.porcelain);
  basin.position.set(0, 2.4, 0.4);
  var column = new THREE.Mesh(geo.sinkColumn, mat.porcelain);
  column.position.set(0, 1.2, 0.4);
  g.add(basin, column);
  return g;
}

function buildBathtub(geo, mat) {
  var g = new THREE.Group();
  var outer = new THREE.Mesh(geo.bathtubOuter, mat.porcelain);
  outer.position.set(0, 0.8, 1.3);
  var inner = new THREE.Mesh(geo.bathtubInner, mat.porcelain);
  inner.position.set(0, 1.15, 1.25);
  g.add(outer, inner);
  return g;
}

function buildShower(geo, mat) {
  // Back panel sits at the wall (z~0); the enclosure opens toward the room
  // at z=3.2, where a paired Shower_Door_Quantity instance attaches.
  var g = new THREE.Group();
  var back = new THREE.Mesh(geo.showerPanel, mat.glass);
  back.position.set(0, 3.25, 0.05);
  var left = new THREE.Mesh(geo.showerPanel, mat.glass);
  left.rotation.y = Math.PI / 2;
  left.position.set(-1.6, 3.25, 1.6);
  var right = left.clone();
  right.position.set(1.6, 3.25, 1.6);
  var pan = new THREE.Mesh(geo.showerPan, mat.porcelain);
  pan.position.set(0, 0.05, 1.6);
  // Wall-mounted shower head: an elbow at the wall, an angled arm, and a
  // disc head facing down into the shower — chrome, matching the toilet's
  // flush lever/mirror-frame hardware finish.
  var headElbow = new THREE.Mesh(geo.showerHeadElbow, mat.chrome);
  headElbow.position.set(0, 6.3, 0.08);
  var headArm = new THREE.Mesh(geo.showerHeadArm, mat.chrome);
  headArm.rotation.x = Math.PI / 2.3;
  headArm.position.set(0, 6.18, 0.28);
  var headDisc = new THREE.Mesh(geo.showerHeadDisc, mat.chrome);
  headDisc.rotation.x = Math.PI / 2.1;
  headDisc.position.set(0, 6.0, 0.48);
  g.add(back, left, right, pan, headElbow, headArm, headDisc);
  return g;
}

function buildShowerDoor(geo, mat) {
  var g = new THREE.Group();
  var panel = new THREE.Mesh(geo.showerDoorPanel, mat.glass);
  panel.position.set(0, 3.25, 0);
  var frame = frameStrips(geo.showerDoorFrameEdge, mat.brass, 2.5, 6.5);
  frame.position.set(0, 3.25, 0);
  g.add(panel, frame);
  return g;
}

function buildEntryDoor(geo, mat) {
  var g = new THREE.Group();
  var slab = new THREE.Mesh(geo.doorSlab, mat.doorTone);
  slab.position.set(0, 3.375, 0);
  var knob = new THREE.Mesh(geo.doorKnob, mat.brass);
  knob.position.set(0.95, 3.0, 0.1);
  g.add(slab, knob);
  return g;
}

// An entry point without a door: no slab, no knob — just a trimmed
// rectangular opening in the wall (same footprint a real door would use),
// so it reads as a doorway rather than a plain, unbroken wall.
function buildEntryArchway(geo, mat) {
  var g = new THREE.Group();
  var frame = frameStrips(geo.doorFrameEdge, mat.doorTone, 2.5, 6.75);
  frame.position.set(0, 3.375, 0);
  g.add(frame);
  return g;
}

function buildVanity(geo, mat) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(geo.vanityBody, mat.cabinetWood);
  body.position.set(0, 1.3, 0.8);
  var basin = new THREE.Mesh(geo.vanityBasin, mat.porcelain);
  basin.position.set(0, 2.66, 0.8);
  g.add(body, basin);
  return g;
}

function buildCabinet(geo, mat) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(geo.cabinetBody, mat.cabinetWood);
  body.position.set(0, 1.3, 0.7);
  g.add(body);
  return g;
}

function buildMirror(geo, mat, huge) {
  var g = new THREE.Group();
  var glassGeo = huge ? geo.mirrorHugeGlass : geo.mirrorGlass;
  var edgeGeo = huge ? geo.mirrorHugeFrameEdge : geo.mirrorFrameEdge;
  var width = huge ? 3.35 : 1.85;
  var height = huge ? 3.85 : 2.35;
  var glass = new THREE.Mesh(glassGeo, mat.glass);
  glass.position.set(0, 0, -0.03);
  var frame = frameStrips(edgeGeo, mat.brass, width, height);
  g.add(glass, frame);
  return g;
}

function buildShowerShelf(geo, mat) {
  var g = new THREE.Group();
  var shelf = new THREE.Mesh(geo.shelfBody, mat.brass);
  shelf.position.set(0, 0, 0);
  g.add(shelf);
  return g;
}

// Toilets are built separately (see buildToiletTemplates below) since,
// unlike every other fixture, they have two interchangeable styles the
// visitor can pick between live.
function buildToiletTemplates(geo, mat) {
  return { A: buildToiletStyleA(geo, mat), B: buildToiletStyleB(geo, mat) };
}

function buildFixtureTemplates(geo, mat) {
  return {
    Sink_Quantity: buildSink(geo, mat),
    Bathtub_Quantity: buildBathtub(geo, mat),
    Shower_Quantity: buildShower(geo, mat),
    Shower_Door_Quantity: buildShowerDoor(geo, mat),
    Door_Quantity: buildEntryDoor(geo, mat),
    Door_Quantity_Archway: buildEntryArchway(geo, mat),
    Vanity_Quantity: buildVanity(geo, mat),
    Cabinet_Quantity: buildCabinet(geo, mat),
    Mirror_Quantity: buildMirror(geo, mat, false),
    Mirror_Huge_Quantity: buildMirror(geo, mat, true),
    Shower_Shelf_Quantity: buildShowerShelf(geo, mat),
  };
}

// ---------------------------------------------------------------------
// Scene state
// ---------------------------------------------------------------------
var state = {
  scope: {},
  dims: { widthFt: null, lengthFt: null, heightFt: null },
  fixtures: {},
  selectedToiletStyle: "A",
  plumbingWallIds: [],
  entryPoints: [], // [{ wallId, offsetFt, hasDoor }]
  cameraMode: "orbit", // "orbit" | "walkin"
  walkInEntryIndex: 0,
  // fixtureKey -> hex color, set once a real product is picked for that
  // category in the chat's materials flow. Applies to every placed
  // instance of that fixture uniformly, matching how a pick actually
  // works today (one product choice covers however many units of that
  // category were ordered, not a different product per unit).
  fixtureFinishes: {},
  // materials-picker categoryKey (floorTile, wallPaint, ...) -> the picked
  // product's surface spec (js/surface-finishes.js), see setSurfaceFinish().
  surfacePicks: {},
};
// Transient wall-click picking session, entirely separate from `state`
// (the room's own data) — null when no picking UI is active.
var picking = null; // { mode: "multi" | "single", onPick, selected: [wallId,...] }
var hoveredWallId = null;
var dirty = true;
// Redrawing every frame at full PBR+shadow cost even while the scene is
// completely static (no typing, camera settled) is wasted GPU/CPU on every
// viewer's device — this flag lets the render loop skip the actual draw
// call whenever nothing has changed since the last one.
var needsRender = true;
var threeState = null; // null = not tried yet, false = tried and failed, object = live scene

var TOILET_STYLE_LABELS = { A: "Skirted two-piece", B: "One-piece seamless" };

function buildToiletStyleSwitch(panel, wrap) {
  var container = document.createElement("div");
  container.className = "ai-chat-room-3d-style-switch";
  container.hidden = true;
  var buttons = {};
  ["A", "B"].forEach(function (key) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-chat-room-3d-style-btn";
    btn.textContent = TOILET_STYLE_LABELS[key];
    btn.setAttribute("aria-pressed", key === state.selectedToiletStyle ? "true" : "false");
    btn.addEventListener("click", function () {
      if (state.selectedToiletStyle === key) return;
      state.selectedToiletStyle = key;
      Object.keys(buttons).forEach(function (k) {
        buttons[k].classList.toggle("selected", k === key);
        buttons[k].setAttribute("aria-pressed", k === key ? "true" : "false");
      });
      markDirty();
    });
    btn.classList.toggle("selected", key === state.selectedToiletStyle);
    buttons[key] = btn;
    container.appendChild(btn);
  });
  panel.insertBefore(container, wrap);
  return container;
}

// The walk-in POV toggle, plus (when more than one entry point is placed) a
// button row to pick which one to stand at — same reusable button-row
// pattern as buildToiletStyleSwitch above.
function buildCameraModeControls(panel, wrap) {
  var container = document.createElement("div");
  container.className = "ai-chat-room-3d-camera-controls";
  container.hidden = true;

  var toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "ai-chat-room-3d-camera-toggle";
  toggleBtn.textContent = "Walk in";
  toggleBtn.addEventListener("click", function () {
    window.BathroomRoom3D.setCameraMode(state.cameraMode === "walkin" ? "orbit" : "walkin");
  });
  container.appendChild(toggleBtn);

  var entrySwitch = document.createElement("div");
  entrySwitch.className = "ai-chat-room-3d-style-switch";
  entrySwitch.hidden = true;
  container.appendChild(entrySwitch);

  panel.insertBefore(container, wrap);
  return { container: container, toggleBtn: toggleBtn, entrySwitch: entrySwitch };
}

// Rebuilds the entry-point picker buttons from whichever entry points the
// layout actually placed (not the raw, possibly-dropped, state.entryPoints)
// and refreshes the toggle button's label/pressed state.
function syncCameraControls(s) {
  if (!s.cameraControls) return;
  var placed = s.lastEntryPlacements || [];
  s.cameraControls.container.hidden = placed.length === 0;
  s.cameraControls.toggleBtn.textContent = state.cameraMode === "walkin" ? "Overview" : "Walk in";
  s.cameraControls.toggleBtn.setAttribute("aria-pressed", state.cameraMode === "walkin" ? "true" : "false");

  var wrap = s.cameraControls.entrySwitch;
  wrap.hidden = placed.length < 2;
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
  placed.forEach(function (p, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-chat-room-3d-style-btn";
    btn.textContent = "Entry " + (i + 1);
    var isSelected = p.index === state.walkInEntryIndex;
    btn.classList.toggle("selected", isSelected);
    btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    btn.addEventListener("click", function () {
      window.BathroomRoom3D.setWalkInEntryIndex(p.index);
    });
    wrap.appendChild(btn);
  });
}

// Tints each wall's highlight overlay: gold + brighter while hovered during
// an active picking session, a dimmer persistent gold for walls already
// picked (plumbing multi-select, or the entry point's own wall in single
// mode), transparent otherwise. Safe to call with any threeState, including
// false/null (before the scene exists) or mid-rebuild.
function applyWallHighlightState(s) {
  if (!s || !s.wallHighlightMaterials) return;
  var selected = picking ? picking.selected : [];
  Object.keys(s.wallHighlightMaterials).forEach(function (id) {
    var mat = s.wallHighlightMaterials[id];
    if (picking && id === hoveredWallId) {
      mat.opacity = 0.4;
    } else if (selected.indexOf(id) !== -1) {
      mat.opacity = 0.22;
    } else {
      mat.opacity = 0;
    }
  });
  needsRender = true;
}

// Resolves one wall click during an active picking session: toggles it in
// "multi" mode (plumbing walls), replaces the single selection in "single"
// mode (one entry point's wall), then reports the updated selection back to
// whoever called beginWallPicking so the chat UI can reflect it live.
function handleWallPick(wallId) {
  if (!picking) return;
  if (picking.mode === "multi") {
    var idx = picking.selected.indexOf(wallId);
    if (idx === -1) picking.selected.push(wallId);
    else picking.selected.splice(idx, 1);
  } else {
    picking.selected = [wallId];
  }
  applyWallHighlightState(threeState);
  if (picking.onPick) picking.onPick(picking.selected.slice(), wallId);
}

function ensureScene() {
  if (threeState !== null) return threeState;
  try {
    var panel = document.getElementById(PANEL_ID);
    var wrap = document.getElementById(CANVAS_WRAP_ID);
    if (!panel || !wrap) {
      threeState = false;
      return threeState;
    }

    var isDark = isDarkTheme();
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    var scene = new THREE.Scene();
    var skyHex = isDark ? 0x211d17 : 0xfaf8f4;
    var groundHex = isDark ? 0x14120f : 0xf3efe7;
    scene.background = new THREE.Color(skyHex);

    // Image-based lighting from a procedurally generated studio-like room
    // (self-hosted, no external HDR file) — this is what makes the
    // porcelain clearcoat and chrome actually pick up soft reflections
    // instead of looking flat. Generated once; not per-rebuild.
    var pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

    var hemi = new THREE.HemisphereLight(skyHex, groundHex, 0.7);
    var dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.bias = -0.0015;
    dir.shadow.normalBias = 0.02;
    scene.add(hemi, dir, dir.target);

    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.45;
    // Fires on every drag and on every damping-settle frame afterward, and
    // stops firing once the camera is genuinely still — exactly the signal
    // the render loop needs to know a frame is worth actually drawing.
    controls.addEventListener("change", function () {
      needsRender = true;
    });

    var geo = buildGeometries();
    var mat = buildMaterials(isDark);
    var fixtureTemplates = buildFixtureTemplates(geo, mat);
    var toiletTemplates = buildToiletTemplates(geo, mat);
    var fixtureGroup = new THREE.Group();
    scene.add(fixtureGroup);

    var shellMaterials = {
      floor: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
      wall: new THREE.MeshStandardMaterial({ side: THREE.BackSide }),
      ceiling: new THREE.MeshStandardMaterial({ side: THREE.BackSide }),
    };
    var shellGroup = new THREE.Group();
    scene.add(shellGroup);

    var toiletStyleSwitch = buildToiletStyleSwitch(panel, wrap);
    var cameraControls = buildCameraModeControls(panel, wrap);

    // Persistent (not recreated per rebuildShell call, unlike wall geometry
    // itself) so highlight state survives a dimension change without
    // leaking materials — rebuildShell only repositions/resizes the
    // highlight mesh for each wall, it never replaces these.
    var wallHighlightMaterials = {
      N: new THREE.MeshBasicMaterial({ color: 0xcda15f, transparent: true, opacity: 0, depthWrite: false }),
      E: new THREE.MeshBasicMaterial({ color: 0xcda15f, transparent: true, opacity: 0, depthWrite: false }),
      S: new THREE.MeshBasicMaterial({ color: 0xcda15f, transparent: true, opacity: 0, depthWrite: false }),
      W: new THREE.MeshBasicMaterial({ color: 0xcda15f, transparent: true, opacity: 0, depthWrite: false }),
    };
    var raycaster = new THREE.Raycaster();
    var pointerDownPos = null;

    function raycastWall(clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      var ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      var meshes = threeState && threeState.wallMeshesById ? Object.values(threeState.wallMeshesById) : [];
      var hits = raycaster.intersectObjects(meshes, false);
      return hits.length ? hits[0].object : null;
    }

    renderer.domElement.addEventListener("pointerdown", function (e) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    renderer.domElement.addEventListener("pointermove", function (e) {
      if (!picking) return;
      var hit = raycastWall(e.clientX, e.clientY);
      var next = hit ? hit.userData.wallId : null;
      if (next !== hoveredWallId) {
        hoveredWallId = next;
        applyWallHighlightState(threeState);
      }
    });
    renderer.domElement.addEventListener("pointerup", function (e) {
      var down = pointerDownPos;
      pointerDownPos = null;
      if (!picking || !down) return;
      var dx = e.clientX - down.x;
      var dy = e.clientY - down.y;
      if (Math.sqrt(dx * dx + dy * dy) > 6) return; // a drag/orbit, not a click
      var hit = raycastWall(e.clientX, e.clientY);
      if (hit) handleWallPick(hit.userData.wallId);
    });

    var resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(function () {
        applySize();
      });
      resizeObserver.observe(wrap);
    }

    function applySize() {
      var w = wrap.clientWidth || 1;
      var h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      needsRender = true;
    }

    threeState = {
      isDark: isDark,
      renderer: renderer,
      scene: scene,
      camera: camera,
      controls: controls,
      geo: geo,
      mat: mat,
      fixtureTemplates: fixtureTemplates,
      toiletTemplates: toiletTemplates,
      fixtureGroup: fixtureGroup,
      shellMaterials: shellMaterials,
      shellGroup: shellGroup,
      shellGeometries: [],
      wallMeshesById: {},
      wallHighlightMaterials: wallHighlightMaterials,
      lastDims: null,
      lastEntryPlacements: [],
      dirLight: dir,
      toiletStyleSwitch: toiletStyleSwitch,
      cameraControls: cameraControls,
      applySize: applySize,
      cameraLerp: null, // { from, to, target, start } while animating, else null
      running: false,
    };
    applySize();
    window.BathroomRoom3D.available = true;
  } catch (err) {
    threeState = false;
  }
  return threeState;
}

// ---------------------------------------------------------------------
// Rebuild: shell (only when dimensions actually changed) + finishes +
// fixtures, driven entirely by the pure layout module.
// ---------------------------------------------------------------------
function disposeShellGeometries(s) {
  s.shellGeometries.forEach(function (g) {
    g.dispose();
  });
  s.shellGeometries = [];
  while (s.shellGroup.children.length) {
    s.shellGroup.remove(s.shellGroup.children[0]);
  }
}

function feetUVs(geometry, uFt, vFt) {
  var uv = geometry.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uFt, uv.getY(i) * vFt);
  uv.needsUpdate = true;
  return geometry;
}

function rebuildShell(s, widthFt, lengthFt, heightFt) {
  disposeShellGeometries(s);

  // UVs are rescaled to feet on the floor and walls, so a picked product's
  // texture (see applySurfaceFinish()) lands at its real size whatever the
  // room's dimensions — one shared repeat per material instead of one per wall.
  var floorGeo = feetUVs(new THREE.PlaneGeometry(widthFt, lengthFt), widthFt, lengthFt);
  var floor = new THREE.Mesh(floorGeo, s.shellMaterials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(widthFt / 2, 0, lengthFt / 2);
  floor.receiveShadow = true;
  s.shellGroup.add(floor);
  s.shellGeometries.push(floorGeo);

  var ceilingGeo = new THREE.PlaneGeometry(widthFt, lengthFt);
  var ceiling = new THREE.Mesh(ceilingGeo, s.shellMaterials.ceiling);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set(widthFt / 2, heightFt, lengthFt / 2);
  ceiling.receiveShadow = true;
  s.shellGroup.add(ceiling);
  s.shellGeometries.push(ceilingGeo);

  s.wallMeshesById = {};
  shellWalls(widthFt, lengthFt).forEach(function (w) {
    var wallGeo = feetUVs(new THREE.PlaneGeometry(w.spanFt, heightFt), w.spanFt, heightFt);
    var wall = new THREE.Mesh(wallGeo, s.shellMaterials.wall);
    wall.rotation.y = w.rotY;
    wall.position.set(w.x, heightFt / 2, w.z);
    wall.receiveShadow = true;
    wall.userData.wallId = w.id;
    s.shellGroup.add(wall);
    s.shellGeometries.push(wallGeo);
    s.wallMeshesById[w.id] = wall;

    // A thin, normally-invisible overlay nudged toward the room interior so
    // it never z-fights with the wall itself — brightened by
    // applyWallHighlightState() while wall-click picking is active.
    if (s.wallHighlightMaterials && s.wallHighlightMaterials[w.id]) {
      var highlightGeo = new THREE.PlaneGeometry(w.spanFt, heightFt);
      var highlight = new THREE.Mesh(highlightGeo, s.wallHighlightMaterials[w.id]);
      highlight.rotation.y = w.rotY;
      var normal = WALL_INWARD_NORMAL[w.id];
      var nudge = 0.02;
      highlight.position.set(w.x + normal.x * nudge, heightFt / 2, w.z + normal.z * nudge);
      highlight.renderOrder = 1;
      s.shellGroup.add(highlight);
      s.shellGeometries.push(highlightGeo);
    }
  });
}

// ---------------------------------------------------------------------
// Real-product surface finishes
// ---------------------------------------------------------------------
// A picked floor tile / wall tile / flooring / paint (see
// js/surface-finishes.js for the per-product specs) renders as PBR texture
// maps generated here on a canvas at the product's true unit size: albedo
// (tone-varied tiles or planks, grout, stone/wood/motif character), a
// normal map (grout joints recessed, subtle surface relief) and a
// roughness map (grout rougher than a glazed face). Shell UVs are in feet
// (see rebuildShell()), so repeat = 12 / repeat-unit-inches puts one real
// inch of product on one real inch of room. Generated once per product
// and cached; a spec with real `maps` files loads those instead.
var Surfaces = window.SurfaceFinishes;
var SURFACE_TEXTURE_MAX_PX = 1024;
// Aim for a repeat unit about this big so tile-to-tile tone variation
// doesn't visibly repeat every tile or two.
var SURFACE_UNIT_TARGET_IN = 36;
var surfaceTextureCache = {}; // spec.id -> { map, normalMap, roughnessMap }

// Deterministic per-product PRNG (mulberry32 over a string hash), so a
// product's generated texture is the same on every load.
function seededRandom(seedText) {
  var h = 2166136261;
  for (var i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h = (h + 0x6d2b79f5) | 0;
    var t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "#rrggbb" scaled by (1 + f), still as "#rrggbb" (canvas takes it as-is).
function shadeHex(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var out = "#";
  [16, 8, 0].forEach(function (shift) {
    var c = clamp(Math.round(((n >> shift) & 255) * (1 + f)), 0, 255);
    out += ("0" + c.toString(16)).slice(-2);
  });
  return out;
}

function grayCss(v01) {
  var v = clamp(Math.round(v01 * 255), 0, 255);
  return "rgb(" + v + "," + v + "," + v + ")";
}

// Long side of the tile/plank runs along U (horizontally on walls, along
// the room's width on the floor), which is how these products are
// normally laid.
function surfaceRepeatUnit(spec) {
  var tileW = Math.max(spec.sizeIn[0], spec.sizeIn[1]);
  var tileH = Math.min(spec.sizeIn[0], spec.sizeIn[1]);
  var cols = Math.max(1, Math.round(SURFACE_UNIT_TARGET_IN / tileW));
  var rows = Math.max(2, Math.round(SURFACE_UNIT_TARGET_IN / tileH));
  if (spec.layout === "offset" && rows % 2) rows++; // half-bond needs pairs
  return { tileW: tileW, tileH: tileH, cols: cols, rows: rows, unitW: cols * tileW, unitH: rows * tileH };
}

function drawTileCharacter(ctx, spec, rand, x, y, w, h, base) {
  var i;
  if (spec.character === "stone") {
    for (i = 0; i < 26; i++) {
      var cx = x + rand() * w;
      var cy = y + rand() * h;
      var rad = (0.15 + rand() * 0.45) * h;
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      // Fades to the SAME tone at zero alpha — fading to transparent black
      // would drag a dark ring into every blob.
      var blob = shadeHex(base, (rand() - 0.5) * 0.1);
      grad.addColorStop(0, blob);
      grad.addColorStop(1, blob + "00");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = shadeHex(base, 0.12);
    for (i = 0; i < 3; i++) {
      ctx.lineWidth = 0.5 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + rand() * h);
      ctx.bezierCurveTo(x + w * 0.33, y + rand() * h, x + w * 0.66, y + rand() * h, x + w, y + rand() * h);
      ctx.stroke();
    }
  } else if (spec.character === "wood") {
    // Grain runs along the plank's length (U).
    ctx.strokeStyle = spec.accent || shadeHex(base, -0.2);
    for (i = 0; i < 22; i++) {
      var gy = y + rand() * h;
      var amp = rand() * h * 0.08;
      var phase = rand() * Math.PI * 2;
      ctx.globalAlpha = 0.12 + rand() * 0.25;
      ctx.lineWidth = 0.4 + rand() * 1.4;
      ctx.beginPath();
      for (var sx = 0; sx <= w; sx += Math.max(2, w / 40)) {
        var sy = gy + Math.sin(phase + (sx / w) * Math.PI * 2 * (1 + rand() * 0.3)) * amp;
        if (sx === 0) ctx.moveTo(x + sx, sy);
        else ctx.lineTo(x + sx, sy);
      }
      ctx.stroke();
    }
  } else if (spec.character === "handmade") {
    // Glaze pooling toward the edges, a touch darker than the face.
    var edge = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.2, x + w / 2, y + h / 2, w * 0.6);
    var pooled = shadeHex(base, -0.06);
    edge.addColorStop(0, pooled + "00");
    edge.addColorStop(1, pooled);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, w, h);
  } else if (spec.character === "encaustic") {
    // A printed quatrefoil: a center ring, quarter rings at each corner
    // (which join into full rings across neighboring tiles), and a center
    // diamond — the same repeat-across-the-grid read the real tile has.
    var s = Math.min(w, h);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = spec.accent;
    ctx.fillStyle = spec.accent;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, s * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ].forEach(function (c) {
      ctx.beginPath();
      ctx.arc(c[0], c[1], s * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h / 2 - s * 0.1);
    ctx.lineTo(x + w / 2 + s * 0.1, y + h / 2);
    ctx.lineTo(x + w / 2, y + h / 2 + s * 0.1);
    ctx.lineTo(x + w / 2 - s * 0.1, y + h / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Tangent-space normal map from a grayscale height canvas (Sobel). Canvas
// rows run down while V runs up (CanvasTexture flips Y), hence the sign
// on the V gradient.
function normalCanvasFromHeight(heightCanvas, strength) {
  var w = heightCanvas.width;
  var h = heightCanvas.height;
  var src = heightCanvas.getContext("2d").getImageData(0, 0, w, h).data;
  var out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  var octx = out.getContext("2d");
  var img = octx.createImageData(w, h);
  var d = img.data;
  function at(px, py) {
    px = (px + w) % w;
    py = (py + h) % h;
    return src[(py * w + px) * 4] / 255;
  }
  for (var py = 0; py < h; py++) {
    for (var px = 0; px < w; px++) {
      var du = (at(px + 1, py) - at(px - 1, py)) * strength;
      var dv = -(at(px, py + 1) - at(px, py - 1)) * strength;
      var len = Math.sqrt(du * du + dv * dv + 1);
      var i = (py * w + px) * 4;
      d[i] = Math.round(((-du / len) * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round(((-dv / len) * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function generateSurfaceCanvases(spec) {
  var unit = surfaceRepeatUnit(spec);
  var pxPerIn = Math.min(SURFACE_TEXTURE_MAX_PX / unit.unitW, SURFACE_TEXTURE_MAX_PX / unit.unitH);
  var W = Math.max(2, Math.round(unit.unitW * pxPerIn));
  var H = Math.max(2, Math.round(unit.unitH * pxPerIn));
  var albedo = makeCanvas(W, H);
  var height = makeCanvas(W, H);
  var rough = makeCanvas(W, H);
  var a = albedo.getContext("2d");
  var hctx = height.getContext("2d");
  var r = rough.getContext("2d");
  var rand = seededRandom(spec.id || spec.color);
  var grout = spec.grout || shadeHex(spec.color, -0.2);
  var groutPx = Math.max(1, (spec.groutIn || 0.0625) * pxPerIn);
  var tileW = unit.tileW * pxPerIn;
  var tileH = unit.tileH * pxPerIn;

  // Background = the joints: grout color, recessed, rough.
  a.fillStyle = grout;
  a.fillRect(0, 0, W, H);
  hctx.fillStyle = grayCss(0.1);
  hctx.fillRect(0, 0, W, H);
  r.fillStyle = grayCss(0.95);
  r.fillRect(0, 0, W, H);

  for (var row = 0; row < unit.rows; row++) {
    var rowOffset = 0;
    if (spec.layout === "offset") rowOffset = (row % 2) * (tileW / 2);
    else if (spec.layout === "stagger") rowOffset = rand() * tileW;
    for (var col = 0; col < unit.cols; col++) {
      var tone = shadeHex(spec.color, (rand() - 0.5) * 2 * (spec.variation || 0));
      var tileSeed = rand();
      var x0 = col * tileW + rowOffset;
      var y0 = row * tileH;
      // Drawn again one repeat unit to the left when it spills past the
      // right edge, so the texture wraps seamlessly.
      [x0, x0 - W].forEach(function (x) {
        if (x >= W || x + tileW <= 0) return;
        var gx = x + groutPx / 2;
        var gy = y0 + groutPx / 2;
        var gw = tileW - groutPx;
        var gh = tileH - groutPx;
        a.save();
        a.beginPath();
        a.rect(gx, gy, gw, gh);
        a.clip();
        a.fillStyle = tone;
        a.fillRect(gx, gy, gw, gh);
        drawTileCharacter(a, spec, seededRandom(String(tileSeed)), gx, gy, gw, gh, tone);
        a.restore();

        // Face raised above the joint, with a one-joint-wide eased edge.
        var bevel = Math.max(1, groutPx);
        for (var b = 0; b < 3; b++) {
          hctx.fillStyle = grayCss(0.55 + b * 0.2);
          hctx.fillRect(gx + (b * bevel) / 3, gy + (b * bevel) / 3, gw - (2 * b * bevel) / 3, gh - (2 * b * bevel) / 3);
        }
        r.fillStyle = grayCss(clamp(spec.roughness + (tileSeed - 0.5) * 0.06, 0.02, 1));
        r.fillRect(gx, gy, gw, gh);
      });
    }
  }
  return {
    albedo: albedo,
    normal: normalCanvasFromHeight(height, spec.kind === "plank" ? 1.5 : 3),
    rough: rough,
    unit: unit,
  };
}

function configureSurfaceTexture(s, tex, unitWIn, unitHIn, isColor) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12 / unitWIn, 12 / unitHIn);
  tex.anisotropy = s.renderer.capabilities.getMaxAnisotropy();
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getSurfaceTextures(s, spec) {
  if (surfaceTextureCache[spec.id]) return surfaceTextureCache[spec.id];
  var textures;
  if (spec.maps) {
    var loader = new THREE.TextureLoader();
    var onLoad = function () {
      needsRender = true;
    };
    var mw = spec.maps.sizeIn[0];
    var mh = spec.maps.sizeIn[1];
    textures = {
      map: configureSurfaceTexture(s, loader.load(spec.maps.albedo, onLoad), mw, mh, true),
      normalMap: spec.maps.normal ? configureSurfaceTexture(s, loader.load(spec.maps.normal, onLoad), mw, mh) : null,
      roughnessMap: spec.maps.roughness
        ? configureSurfaceTexture(s, loader.load(spec.maps.roughness, onLoad), mw, mh)
        : null,
    };
  } else {
    var c = generateSurfaceCanvases(spec);
    textures = {
      map: configureSurfaceTexture(s, new THREE.CanvasTexture(c.albedo), c.unit.unitW, c.unit.unitH, true),
      normalMap: configureSurfaceTexture(s, new THREE.CanvasTexture(c.normal), c.unit.unitW, c.unit.unitH),
      roughnessMap: configureSurfaceTexture(s, new THREE.CanvasTexture(c.rough), c.unit.unitW, c.unit.unitH),
    };
  }
  surfaceTextureCache[spec.id] = textures;
  return textures;
}

// Dresses one shell material with a picked product's spec, or (spec null)
// back to the generic scope-driven color/roughness it had before.
function applySurfaceFinish(s, material, spec, fallbackHex, fallbackRoughness) {
  var hadMaps = !!material.map;
  if (spec && spec.kind !== "paint") {
    var t = getSurfaceTextures(s, spec);
    material.color.setHex(0xffffff);
    material.roughness = 1; // the roughness map carries the real values
    material.map = t.map;
    material.normalMap = t.normalMap;
    material.roughnessMap = t.roughnessMap;
  } else {
    if (spec) material.color.set(spec.color);
    else material.color.setHex(fallbackHex);
    material.roughness = spec ? spec.roughness : fallbackRoughness;
    material.map = null;
    material.normalMap = null;
    material.roughnessMap = null;
  }
  if (hadMaps !== !!material.map) material.needsUpdate = true;
}

// Roughness per finish — tile reads glossier/more reflective, paint and
// bare flooring read more matte, so the same scope-driven colors respond
// believably under the new image-based lighting instead of looking like
// flat color swatches.
function roughnessForFloorFinish(value) {
  if (value === "tile") return 0.35;
  if (value === "flooring") return 0.55;
  return 0.85;
}

function roughnessForWalls(value) {
  if (value === "tile") return 0.35;
  if (value === "paint") return 0.7;
  return 0.9;
}

function roughnessForCeiling(paintCeilingBool) {
  return paintCeilingBool === true ? 0.7 : 0.9;
}

function rebuildFinishes(s) {
  var isDark = s.isDark;
  var picked = Surfaces
    ? Surfaces.resolveSurfaces(state.scope, state.surfacePicks)
    : { floor: null, walls: null, ceiling: null };
  applySurfaceFinish(
    s,
    s.shellMaterials.floor,
    picked.floor,
    Layout.colorForFloorFinish(state.scope.floorFinish, isDark),
    roughnessForFloorFinish(state.scope.floorFinish),
  );
  applySurfaceFinish(
    s,
    s.shellMaterials.wall,
    picked.walls,
    Layout.colorForWalls(state.scope.walls, isDark),
    roughnessForWalls(state.scope.walls),
  );
  applySurfaceFinish(
    s,
    s.shellMaterials.ceiling,
    picked.ceiling,
    Layout.colorForCeiling(state.scope.paintCeiling, isDark),
    roughnessForCeiling(state.scope.paintCeiling),
  );
}

function setShadowFlags(object3d) {
  object3d.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function rebuildFixtures(s, widthFt, lengthFt) {
  while (s.fixtureGroup.children.length) {
    var old = s.fixtureGroup.children[0];
    disposeFixtureInstance(old);
    s.fixtureGroup.remove(old);
  }
  var layout = Layout.computeLayout({
    widthFt: widthFt,
    lengthFt: lengthFt,
    fixtureCounts: state.fixtures,
    plumbingWallIds: state.plumbingWallIds,
    entryPoints: state.entryPoints,
  });
  s.lastEntryPlacements = layout.placements.filter(function (p) {
    return p.fixtureKey === "Door_Quantity";
  });
  var toiletCount = 0;
  layout.placements.forEach(function (p) {
    // An entry point without a door renders as a trimmed open archway —
    // no slab or knob — instead of the normal door template.
    var archway = p.fixtureKey === "Door_Quantity" && p.hasDoor === false;
    var template = archway
      ? s.fixtureTemplates.Door_Quantity_Archway
      : p.fixtureKey === "Toilet_Quantity"
        ? s.toiletTemplates[state.selectedToiletStyle]
        : s.fixtureTemplates[p.fixtureKey];
    if (!template) return;
    if (p.fixtureKey === "Toilet_Quantity") toiletCount++;
    var footprint = Layout.FIXTURE_LAYOUT[p.fixtureKey];
    // Wall-mounted builders (mirrors, shelf) are modeled centered on their
    // own origin, so they need placement.y (the mount height). Every other
    // builder in this file is modeled from a floor origin (y=0) upward, in
    // absolute heights — using placement.y for those would double-count
    // the vertical offset already baked into the template's meshes.
    var y = footprint && footprint.mount === "wall" ? p.y : 0;
    var instance = template.clone(true);
    instance.position.set(p.x, y, p.z);
    instance.rotation.y = p.rotationY;
    if (p.depthOffset) {
      instance.translateZ(p.depthOffset);
    }
    // setFixtureFinish() looks instances up by this to retint in place
    // without a full rebuild — see updateFixtureFinishInstances().
    instance.userData.fixtureKey = p.fixtureKey;
    var finish = state.fixtureFinishes[p.fixtureKey];
    if (finish != null) applyFixtureFinish(instance, p.fixtureKey, s.mat, finish);
    setShadowFlags(instance);
    s.fixtureGroup.add(instance);
  });
  if (s.toiletStyleSwitch) s.toiletStyleSwitch.hidden = toiletCount === 0;
  syncCameraControls(s);
}

function startCameraLerp(s, newTarget, newDistance) {
  var dir = new THREE.Vector3().subVectors(s.camera.position, s.controls.target).normalize();
  if (!isFinite(dir.x)) dir.set(0.6, 0.5, 0.7).normalize();
  var desired = new THREE.Vector3().copy(newTarget).addScaledVector(dir, newDistance);
  s.cameraLerp = { from: s.camera.position.clone(), to: desired, start: performance.now(), durationMs: 300 };
}

function applyCameraLerp(s) {
  if (!s.cameraLerp) return;
  var t = clamp((performance.now() - s.cameraLerp.start) / s.cameraLerp.durationMs, 0, 1);
  var eased = easeOutCubic(t);
  s.camera.position.lerpVectors(s.cameraLerp.from, s.cameraLerp.to, eased);
  if (t >= 1) s.cameraLerp = null;
}

// Walk-in POV: puts the camera at the chosen entry point's exact position
// (eye height) and reuses the existing OrbitControls instance for look-
// around, by pointing its target an imperceptible epsilon into the room and
// clamping min/maxDistance to that same epsilon — this keeps the camera
// pinned in place (it can't orbit away or zoom) while still letting the
// existing drag/damping code rotate the view, since OrbitControls always
// re-derives camera.position from camera/target offset on every update().
function applyCameraMode(s) {
  if (!s) return;
  var dims = Layout.computeRoomDimensions(state.dims);
  if (state.cameraMode === "walkin") {
    var ep = (s.lastEntryPlacements || []).filter(function (p) {
      return p.index === state.walkInEntryIndex;
    })[0];
    if (!ep) {
      // The chosen entry point isn't currently placed (e.g. a room resize
      // dropped it) — nowhere to stand, fall back to the overview instead
      // of leaving the camera stranded at a stale position.
      state.cameraMode = "orbit";
    } else {
      var normal = WALL_INWARD_NORMAL[ep.wallId] || { x: 0, z: 1 };
      // A typical standing eye height, but never above the ceiling: rooms
      // can legally be as short as Layout.RENDER_MIN_DIM (2ft), where a
      // fixed 5.5ft would put the camera outside the shell looking at the
      // back (non-rendering) side of the BackSide-material ceiling.
      var eyeHeight = Math.min(5.5, dims.heightFt - 1);
      var epsilon = 0.05;
      s.cameraLerp = null;
      s.camera.position.set(ep.x, eyeHeight, ep.z);
      s.controls.target.set(ep.x + normal.x * epsilon, eyeHeight, ep.z + normal.z * epsilon);
      s.controls.minDistance = epsilon;
      s.controls.maxDistance = epsilon;
      s.controls.update();
      needsRender = true;
      syncCameraControls(s);
      return;
    }
  }

  // Orbit / overview — same framing math as rebuild()'s dimsChanged branch,
  // reused here so leaving walk-in mode (with dims unchanged, so rebuild()
  // itself wouldn't otherwise touch the camera) still returns smoothly.
  var target = new THREE.Vector3(dims.widthFt / 2, dims.heightFt * 0.4, dims.lengthFt / 2);
  var diag = Math.sqrt(dims.widthFt * dims.widthFt + dims.lengthFt * dims.lengthFt);
  s.controls.minDistance = clamp(diag * 0.5, 3, 20);
  s.controls.maxDistance = clamp(diag * 1.9, 12, 160);
  s.controls.target.copy(target);
  startCameraLerp(
    s,
    target,
    clamp(s.camera.position.distanceTo(target) || diag, s.controls.minDistance, s.controls.maxDistance),
  );
  s.controls.update();
  needsRender = true;
  syncCameraControls(s);
}

function rebuild() {
  var s = threeState;
  if (!s) return;
  var dims = Layout.computeRoomDimensions(state.dims);
  var dimsChanged =
    !s.lastDims ||
    s.lastDims.widthFt !== dims.widthFt ||
    s.lastDims.lengthFt !== dims.lengthFt ||
    s.lastDims.heightFt !== dims.heightFt;

  if (dimsChanged) {
    rebuildShell(s, dims.widthFt, dims.lengthFt, dims.heightFt);

    var target = new THREE.Vector3(dims.widthFt / 2, dims.heightFt * 0.4, dims.lengthFt / 2);
    var diag = Math.sqrt(dims.widthFt * dims.widthFt + dims.lengthFt * dims.lengthFt);
    var minDistance = clamp(diag * 0.5, 3, 20);
    var maxDistance = clamp(diag * 1.9, 12, 160);
    s.controls.minDistance = minDistance;
    s.controls.maxDistance = maxDistance;

    // Directional light + its shadow camera frustum are sized to the
    // room's own diagonal so the shadow stays crisp at both the tiny
    // default footprint and the largest legal room.
    s.dirLight.position.set(dims.widthFt * 0.6, dims.heightFt * 2.2, dims.lengthFt * 0.6);
    s.dirLight.target.position.set(dims.widthFt / 2, 0, dims.lengthFt / 2);
    s.dirLight.target.updateMatrixWorld();
    var frustum = clamp(diag * 0.75, 3, 60);
    s.dirLight.shadow.camera.left = -frustum;
    s.dirLight.shadow.camera.right = frustum;
    s.dirLight.shadow.camera.top = frustum;
    s.dirLight.shadow.camera.bottom = -frustum;
    s.dirLight.shadow.camera.near = 0.5;
    s.dirLight.shadow.camera.far = dims.heightFt * 2.2 + frustum + 5;
    s.dirLight.shadow.camera.updateProjectionMatrix();

    if (!s.lastDims) {
      // First build: place the camera directly, no lerp needed.
      s.camera.position.set(dims.widthFt * 1.3, dims.heightFt * 1.1, dims.lengthFt * 1.6);
      s.controls.target.copy(target);
    } else {
      var jump = target.distanceTo(s.controls.target) + Math.abs(diag - (s.lastDiag || diag));
      s.controls.target.copy(target);
      if (jump > 0.75) {
        startCameraLerp(s, target, clamp(s.camera.position.distanceTo(s.controls.target), minDistance, maxDistance));
      }
    }
    s.controls.update();
    s.lastDims = dims;
    s.lastDiag = diag;
  }

  rebuildFinishes(s);
  rebuildFixtures(s, dims.widthFt, dims.lengthFt);
  // Follows the room if it resizes while walking in, or if the layout's
  // entry-point placement shifted; a no-op re-pin when nothing moved.
  if (state.cameraMode === "walkin") applyCameraMode(s);
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
function markDirty() {
  dirty = true;
}

window.BathroomRoom3D = {
  available: false,

  show: function () {
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = false;
    // ensureScene()'s first-ever call does real synchronous work (PMREM
    // environment generation, shader compilation) — deferred one frame so
    // the browser gets to paint the panel becoming visible (and whatever
    // else changed in this same call, like the progress bar) before that
    // work blocks the main thread, instead of both happening in one
    // uninterrupted synchronous stretch.
    requestAnimationFrame(function () {
      if (panel && panel.hidden) return; // hidden again before this ran
      var s = ensureScene();
      if (!s || s.running) return;
      s.running = true;
      s.renderer.setAnimationLoop(function tick() {
        if (dirty) {
          rebuild();
          dirty = false;
          needsRender = true;
        }
        if (s.cameraLerp) {
          applyCameraLerp(s);
          needsRender = true;
        }
        // Always ticked (cheap, no draw): keeps damping inertia settling
        // and fires the "change" listener above for as long as the camera
        // is actually still moving.
        s.controls.update();
        if (needsRender) {
          s.renderer.render(s.scene, s.camera);
          needsRender = false;
        }
      });
    });
  },

  hide: function () {
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = true;
    if (threeState) {
      threeState.renderer.setAnimationLoop(null);
      threeState.running = false;
    }
  },

  reset: function () {
    state = {
      scope: {},
      dims: { widthFt: null, lengthFt: null, heightFt: null },
      fixtures: {},
      selectedToiletStyle: "A",
      plumbingWallIds: [],
      entryPoints: [],
      cameraMode: "orbit",
      walkInEntryIndex: 0,
      fixtureFinishes: {},
      surfacePicks: {},
    };
    picking = null;
    hoveredWallId = null;
    if (threeState) {
      threeState.lastDims = null;
      threeState.lastEntryPlacements = [];
      if (threeState.toiletStyleSwitch) {
        Array.prototype.forEach.call(threeState.toiletStyleSwitch.children, function (btn, i) {
          var isDefault = i === 0;
          btn.classList.toggle("selected", isDefault);
          btn.setAttribute("aria-pressed", isDefault ? "true" : "false");
        });
      }
      applyWallHighlightState(threeState);
    }
    markDirty();
  },

  setScope: function (fieldKey, value) {
    state.scope[fieldKey] = value;
    markDirty();
  },

  setDimension: function (fieldKey, rawValue) {
    var key =
      fieldKey === "Bathroom_Width_Ft" ? "widthFt" : fieldKey === "Bathroom_Length_Ft" ? "lengthFt" : "heightFt";
    state.dims = Layout.applyDimensionInput(state.dims, key, rawValue);
    markDirty();
  },

  setFixtureCount: function (fixtureKey, rawValue) {
    state.fixtures = Layout.applyFixtureInput(state.fixtures, fixtureKey, rawValue);
    markDirty();
  },

  // Whether candidate fixture counts would all actually fit in the current
  // room (dimensions, plumbing-wall restriction, entry points already
  // placed) — the same clearance/overlap/anchor checks computeLayout always
  // runs, just run ahead of time against counts that haven't been
  // committed to state.fixtures yet, so a submit can be blocked instead of
  // silently dropping whatever didn't fit. Returns droppedCounts (a plain
  // {fixtureKey: droppedCount} map, empty when everything fits). Callers
  // are expected to only pass already-range-validated counts (e.g. after
  // Pricing.validateJob) — this does no input sanitizing of its own.
  checkFit: function (fixtureCounts) {
    var dims = Layout.computeRoomDimensions(state.dims);
    var result = Layout.computeLayout({
      widthFt: dims.widthFt,
      lengthFt: dims.lengthFt,
      fixtureCounts: fixtureCounts,
      plumbingWallIds: state.plumbingWallIds,
      entryPoints: state.entryPoints,
    });
    return result.droppedCounts;
  },

  // Applies once a real product is picked for this category in the chat's
  // materials flow — retints every placed instance of that fixture type
  // toward colorHex (see applyFixtureFinish()/FIXTURE_FINISH_MATERIAL_KEY
  // above). colorHex is typically MaterialsPricing.guessFinishColor()'s
  // result; pass null/undefined to clear back to the default color (e.g.
  // if the pick is changed to a product with no recognizable finish word).
  setFixtureFinish: function (fixtureKey, colorHex) {
    if (colorHex == null) delete state.fixtureFinishes[fixtureKey];
    else state.fixtureFinishes[fixtureKey] = colorHex;
    // Placement is untouched by a finish change, so this retints whatever
    // is already placed in place instead of going through markDirty()'s
    // full rebuild — cheap and safe even if nothing of this type is placed
    // yet (a no-op then; the eventual real rebuild picks up
    // state.fixtureFinishes correctly once it exists).
    if (threeState) {
      updateFixtureFinishInstances(threeState, fixtureKey, colorHex);
      needsRender = true;
    } else {
      markDirty();
    }
  },

  // Applies once a real floor tile / wall tile / flooring / paint product is
  // picked in the chat's materials flow (categoryKey is the picker's
  // category key; product is the catalog option). The room's floor, walls
  // or ceiling then render as that product — its real tile size, layout,
  // color, grout and sheen — for as long as the matching scope answer
  // holds (see SurfaceFinishes.resolveSurfaces()). A product with no
  // surface spec, or product null, clears back to the generic finish.
  setSurfaceFinish: function (categoryKey, product) {
    var spec = Surfaces ? Surfaces.specFor(product) : null;
    if (spec) state.surfacePicks[categoryKey] = spec;
    else delete state.surfacePicks[categoryKey];
    if (threeState) {
      rebuildFinishes(threeState);
      needsRender = true;
    } else {
      markDirty();
    }
  },

  // Which picked product (by catalog id) each surface currently shows —
  // null where the generic scope color is showing instead. For tests.
  getSurfaceFinishes: function () {
    var picked = Surfaces
      ? Surfaces.resolveSurfaces(state.scope, state.surfacePicks)
      : { floor: null, walls: null, ceiling: null };
    return {
      floor: picked.floor ? picked.floor.id : null,
      walls: picked.walls ? picked.walls.id : null,
      ceiling: picked.ceiling ? picked.ceiling.id : null,
    };
  },

  // --- Wall-click picking (plumbing walls + entry points) ---------------

  // mode: "multi" (plumbing walls — click to toggle any number) or "single"
  // (one entry point's wall — click replaces the selection). onPick(ids,
  // justClickedId) fires after every click with the running selection so
  // the chat UI can render it live; the caller reads the final selection
  // from its own last onPick call, there's nothing to "commit" here.
  beginWallPicking: function (mode, onPick) {
    var s = ensureScene();
    if (!s) return;
    picking = { mode: mode === "multi" ? "multi" : "single", onPick: onPick || null, selected: [] };
    hoveredWallId = null;
    applyWallHighlightState(s);
  },

  endWallPicking: function () {
    picking = null;
    hoveredWallId = null;
    applyWallHighlightState(threeState);
  },

  setPlumbingWalls: function (wallIds) {
    state.plumbingWallIds = Array.isArray(wallIds) ? wallIds.slice() : [];
    markDirty();
  },

  // --- Entry points -------------------------------------------------

  // Merges onto the existing entry point at this index when the wall id is
  // unchanged (e.g. re-calling this to flip hasDoor after the customer
  // already nudged the position) instead of resetting offsetFt back to
  // center — only a genuinely new wall pick re-centers it.
  setEntryPoint: function (index, data) {
    if (!data || !data.wallId) return;
    var dims = Layout.computeRoomDimensions(state.dims);
    var span = wallSpanFor(data.wallId, dims.widthFt, dims.lengthFt);
    var existing = state.entryPoints[index];
    var sameWall = existing && existing.wallId === data.wallId;
    var offsetFt = data.offsetFt != null ? data.offsetFt : sameWall ? existing.offsetFt : span / 2;
    state.entryPoints[index] = {
      wallId: data.wallId,
      offsetFt: Layout.clampEntryOffset(span, offsetFt),
      hasDoor: data.hasDoor != null ? data.hasDoor !== false : sameWall ? existing.hasDoor : true,
    };
    markDirty();
  },

  removeEntryPoint: function (index) {
    state.entryPoints.splice(index, 1);
    markDirty();
  },

  nudgeEntryPoint: function (index, deltaFt) {
    var ep = state.entryPoints[index];
    if (!ep) return;
    var dims = Layout.computeRoomDimensions(state.dims);
    var span = wallSpanFor(ep.wallId, dims.widthFt, dims.lengthFt);
    ep.offsetFt = Layout.clampEntryOffset(span, ep.offsetFt + (deltaFt || 0));
    markDirty();
  },

  // A shallow copy of the confirmed entry points so far, each
  // {wallId, offsetFt, hasDoor} — used to derive the "Entry doors" fixture
  // count straight from what was actually placed (see appendEntryPointsStep
  // in js/script.js) instead of asking for it a second time.
  getEntryPoints: function () {
    return state.entryPoints.slice();
  },

  // --- Walk-in POV camera -------------------------------------------

  setCameraMode: function (mode) {
    var s = ensureScene();
    if (!s) return;
    state.cameraMode = mode === "walkin" ? "walkin" : "orbit";
    applyCameraMode(s);
  },

  setWalkInEntryIndex: function (index) {
    state.walkInEntryIndex = index;
    if (threeState && state.cameraMode === "walkin") applyCameraMode(threeState);
    else if (threeState) syncCameraControls(threeState);
  },
};
