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
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

var Layout = window.BathroomRoomLayout;
// Button labels in the page's language (js/i18n.js). Kohler product names
// stay as they are; only the words describing them are translated.
var T = window.I18n.t;

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
    // Real product models (see FIXTURE_MODELS) mark their own finish
    // surface with userData.finishBase instead of sharing `mat`'s material.
    // It's a `mat` key, not the material itself: clone() deep-copies
    // userData through JSON, which would turn a material into a plain object.
    var base =
      child.isMesh && (mat[child.userData.finishBase] || (child.material === sharedMaterial && sharedMaterial));
    if (base) {
      if (!tinted) {
        tinted = base.clone();
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
        child.material = s.mat[child.userData.finishBase] || sharedMaterial;
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
  // Brushed stainless (the Bachata sink bowl).
  var stainless = new THREE.MeshStandardMaterial({ color: 0xc4c7c9, roughness: 0.38, metalness: 0.9 });
  var chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd8dadb,
    roughness: 0.12,
    metalness: 1,
    clearcoat: 0.3,
  });
  // Stone/quartz vanity top — only used once a real undermount bowl
  // swaps the vanity to buildUndermountVanity().
  var countertop = new THREE.MeshStandardMaterial({ color: isDark ? 0xd9d5cc : 0xeeebe5, roughness: 0.35 });
  // Mirror glass: a smooth, fully metallic surface, so it reflects the
  // room's environment light instead of showing the wall through it.
  var mirrorGlass = new THREE.MeshStandardMaterial({ color: 0xdfe5e8, roughness: 0.04, metalness: 1 });
  return {
    countertop: countertop,
    mirrorGlass: mirrorGlass,
    stainless: stainless,
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
    vanityLowerBody: new THREE.BoxGeometry(2.5, 2.0, 1.6),
    vanityApronX: new THREE.BoxGeometry(2.5, 0.5, 0.05),
    vanityApronZ: new THREE.BoxGeometry(0.05, 0.5, 1.5),
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
  // Hidden when a Kohler showerhead is picked (see addProductParts()).
  [headElbow, headArm, headDisc].forEach(function (m) {
    m.userData.standardShowerHead = true;
  });
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

// Hung like the Kohler mirrors: bottom edge at MIRROR_BOTTOM_FT (clear of a
// vanity top and faucet), on the wall's face rather than sunk into it. The
// group's origin is the layout's mountHeight, so the parts are offset from it.
function buildMirror(geo, mat, huge) {
  var g = new THREE.Group();
  var glassGeo = huge ? geo.mirrorHugeGlass : geo.mirrorGlass;
  var edgeGeo = huge ? geo.mirrorHugeFrameEdge : geo.mirrorFrameEdge;
  var width = huge ? 3.35 : 1.85;
  var height = huge ? 3.85 : 2.35;
  var mountY = Layout.FIXTURE_LAYOUT[huge ? "Mirror_Huge_Quantity" : "Mirror_Quantity"].mountHeight;
  var centerY = MIRROR_BOTTOM_FT + height / 2 - mountY;
  var glass = new THREE.Mesh(glassGeo, mat.mirrorGlass);
  glass.position.set(0, centerY, 0.02);
  var frame = frameStrips(edgeGeo, mat.brass, width, height);
  frame.position.set(0, centerY, 0.03);
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
// ---------------------------------------------------------------------
// Real product models
// ---------------------------------------------------------------------
// Manufacturer/catalog 3D models, converted from .obj by
// tools/models/obj-to-glb.mjs into this file's fixture convention (feet,
// Y up, back on the wall at z = 0, projecting toward +z, resting on the
// floor or — wall-hung — at its real mount height). Loaded after the scene
// is up; until one arrives (or if it fails to), the procedural stand-in
// for that fixture type keeps rendering, so nothing here can break the
// preview. The source OBJs carry no usable materials, so every mesh gets
// the shared glazed-porcelain material (and stays retintable by
// setFixtureFinish() via userData.finishBase).
var FIXTURE_MODELS = {
  Toilet_Quantity: "models/fixtures/toilet.glb",
  Sink_Quantity: "models/fixtures/sink.glb",
};

// Fetched lazily, the first time a fixture of that type is actually placed
// (see rebuildFixtures()) — most visitors never add a tub, and pulling
// every model at estimate start competes with the chat UI for the main
// thread on slower devices.
var fixtureModelLoader = null;

// Model paths are relative to the site root; the Spanish and Portuguese
// pages live one folder down (es/, pt/), so resolve them from this file.
function siteUrl(path) {
  return new URL("../" + path, import.meta.url).href;
}

function ensureFixtureModel(s, fixtureKey) {
  if (!FIXTURE_MODELS[fixtureKey] || s.modelRequests[fixtureKey]) return;
  s.modelRequests[fixtureKey] = true;
  if (!fixtureModelLoader) fixtureModelLoader = new GLTFLoader();
  fixtureModelLoader.load(
    siteUrl(FIXTURE_MODELS[fixtureKey]),
    function (gltf) {
      var template = gltf.scene;
      template.traverse(function (child) {
        if (child.isMesh) {
          child.material = s.mat.porcelainGloss;
          child.userData.finishBase = "porcelainGloss";
        }
      });
      if (fixtureKey === "Toilet_Quantity") {
        // One real model replaces both procedural styles — the style
        // switch only chooses between stand-ins, so it's hidden once a
        // real toilet is showing (see rebuildFixtures()).
        s.toiletTemplates.A = template;
        s.toiletTemplates.B = template;
      } else {
        s.fixtureTemplates[fixtureKey] = template;
      }
      s.realModels[fixtureKey] = true;
      markDirty();
    },
    undefined,
    function (err) {
      console.warn("3D preview: couldn't load " + FIXTURE_MODELS[fixtureKey] + ", keeping the stand-in.", err);
    },
  );
}

// ---------------------------------------------------------------------
// Kohler product switcher
// ---------------------------------------------------------------------
// The Studio Kohler models (models/products/kohler/, converted from the
// Restor .obj downloads — see that folder's manifest.json for each one's
// name, source and conversion flags), grouped into slots the visitor can
// flip between with a dropdown per slot above the canvas. Purely visual:
// nothing here feeds the estimate's pricing.
//
// Positions are in the fixture's own frame (feet, back on the wall at
// z = 0), and some depend on another slot's pick — a tub faucet sits on
// whichever tub is showing, a sink faucet behind whichever bowl is in the
// vanity — so each option's place() gets every slot's current option.
//   body:      this slot's model IS the fixture (replaces the stand-in or
//              the default model), rather than being added onto it
//   url: null  the slot's stand-in: the procedural/default model for a
//              body slot, or nothing at all ("none") for an add-on
//   footprint: a body's real size, fed to Layout.computeLayout() so
//              clearance/fit checks follow the picked product
//   available: (sel) -> false when the option doesn't go with another
//              slot's pick (a 60 in. sliding door on a 36 in. base); the
//              slot then shows its first option that does, and the
//              dropdown says why (unavailableReason, an i18n key)
//   extras:    more models placed with the option (a showerhead's arm)
//   anchor:    "topCenter" — place() gives where the model's top center
//              goes, for parts that are rotated before placing
//   deckLine:  a deck-mounted faucet's mounting-hole line, measured from
//              its model's back edge
//   dropIn:    a drop-in or alcove tub ("oval" or "rect" basin) — drawn set
//              into a stone tub deck (see buildTubDeck) instead of standing
//              on its bare shell

// Where a mirror's bottom edge goes: ~10 in. above a 31 in. vanity top.
var MIRROR_BOTTOM_FT = 3.4;
// Top of a shower arm's wall flange (about 80 in.).
var SHOWER_ARM_TOP_FT = 6.75;

// Deck-mounted sink faucets, shared by the vanity and the pedestal/wall
// sink rows (each row gets its own copies, since place() differs).
// mount: the faucet holes it needs — "single" (one hole), "centerset" (three
// holes 4 in. apart) or "widespread" (three holes 8 in. apart).
var SINK_FAUCETS = [
  { id: "K-14410-4-CP", url: "models/products/kohler/K-14410-4-CP.glb", deckLine: 0.17, mount: "widespread" },
  { id: "K-77974-9-CP", url: "models/products/kohler/K-77974-9-CP.glb", deckLine: 0.11, mount: "widespread" },
  { id: "K-14402-4A-CP", url: "models/products/kohler/K-14402-4A-CP.glb", deckLine: 0.12, mount: "single" },
  { id: "K-73167-4-CP", url: "models/products/kohler/K-73167-4-CP.glb", deckLine: 0.03, mount: "single" },
  { id: "K-77958-4A-CP", url: "models/products/kohler/K-77958-4A-CP.glb", deckLine: 0.26, mount: "single" },
  { id: "K-35951-4-CP", url: "models/products/kohler/K-35951-4-CP.glb", deckLine: 0.11, mount: "centerset" },
  { id: "K-27388-4-CP", url: "models/products/kohler/K-27388-4-CP.glb", deckLine: 0.09, mount: "centerset" },
  // Components spouts go in with the Components handles either side.
  {
    id: "K-77969-CP",
    url: "models/products/kohler/K-77969-CP.glb",
    deckLine: 0.08,
    mount: "widespread",
    handles: { url: "models/products/kohler/K-77974-9-CP.glb", deckLine: 0.11 },
  },
  {
    id: "K-77967-CP",
    url: "models/products/kohler/K-77967-CP.glb",
    deckLine: 0.1,
    mount: "widespread",
    handles: { url: "models/products/kohler/K-77974-9-CP.glb", deckLine: 0.11 },
  },
];

// Which faucets each sink's drilling takes (a sink's `holes`; a bowl with
// none, like an undermount, takes any faucet, since that goes in the
// countertop). A single-handle faucet also fits a 4 in. centerset sink with
// its deck plate.
var FAUCET_FITS = {
  single: ["single"],
  centerset: ["centerset", "single"],
  widespread: ["widespread"],
};

// deck(sel) -> { y, line }: the deck height and faucet-hole line (from the
// wall) of whatever the faucets in this row sit on.
// bowl(sel): the sink option the faucets in this row go on.
function sinkFaucetOptions(deck, bowl) {
  return SINK_FAUCETS.map(function (f) {
    var opt = { id: f.id, url: f.url, material: "chrome", deckLine: f.deckLine };
    opt.available = function (sel) {
      var holes = bowl(sel).holes;
      return !holes || FAUCET_FITS[holes].indexOf(f.mount) !== -1;
    };
    opt.unavailableReason = "room3d.wrongHoles";
    opt.place = function (sel) {
      var d = deck(sel);
      return [0, d.y, d.line - f.deckLine];
    };
    if (f.handles) {
      opt.extras = [
        {
          url: f.handles.url,
          material: "chrome",
          place: function (sel) {
            var d = deck(sel);
            return [0, d.y, d.line - f.handles.deckLine];
          },
        },
      ];
    }
    return opt;
  });
}

// Wall-hung accessories: centered on (x, centerY) on the wall behind.
function onWall(x, centerY) {
  return function (sel, opt, size) {
    return [x, centerY - size.y / 2, 0];
  };
}

function accessoryOptions(ids, material, place) {
  return [{ id: "none", url: null }].concat(
    ids.map(function (id) {
      return { id: id, url: "models/products/kohler/" + id + ".glb", material: material, place: place };
    }),
  );
}

function noneLast(options) {
  return options.slice(1).concat(options[0]);
}

var TOWEL_BARS = ["K-14436-CP", "K-14435-CP", "K-78373-CP", "K-14441-CP"];
var PAPER_HOLDERS = ["K-14377-CP", "K-13504-CP", "K-73147-CP", "K-78382-CP"];
var GRAB_BARS = ["K-10542-CP", "K-10544-CP", "K-11895-BS", "K-25161-CP"];
var ROBE_HOOKS = ["K-14443-CP", "K-23529-CP"];

// Each bar's overall length, flanges included (ft).
var GRAB_BAR_LENGTHS = { "K-10542-CP": 2.23, "K-10544-CP": 3.23, "K-11895-BS": 3.2, "K-25161-CP": 3.2 };

// fits(sel, length): whether a bar that long goes on this fixture's wall.
function grabBarOptions(place, fits) {
  return accessoryOptions(GRAB_BARS, "chrome", place).map(function (opt) {
    // The Purist bar is brushed stainless, not chrome.
    if (opt.id === "K-11895-BS") opt.material = "stainless";
    if (opt.url && fits) {
      opt.available = function (sel) {
        return fits(sel, GRAB_BAR_LENGTHS[opt.id]);
      };
      opt.unavailableReason = "room3d.tooLong";
    }
    return opt;
  });
}

function isFreestandingTub(sel) {
  return !sel.tub.dropIn;
}

function kohlerUrl(id) {
  return "models/products/kohler/" + id + ".glb";
}

function tubDepth(tub) {
  return tub.depth || (tub.footprint && tub.footprint.depth) || 2.85;
}

var isWideBase = function (sel) {
  return !!sel.showerBase.wide;
};
var isNarrowShower = function (sel) {
  return !sel.showerBase.wide;
};

var PRODUCT_SLOTS = [
  {
    id: "toilet",
    fixtureKey: "Toilet_Quantity",
    body: true,
    options: [
      // The generic toilet the room has always shown (models/fixtures/).
      { id: "standard-toilet", url: null },
      { id: "K-31648-0", url: kohlerUrl("K-31648-0"), footprint: { wallSpan: 1.7, depth: 2.45 } },
      { id: "K-31626-DRY-0", url: kohlerUrl("K-31626-DRY-0"), footprint: { wallSpan: 1.7, depth: 2.45 } },
      { id: "K-31641-0", url: kohlerUrl("K-31641-0") },
      { id: "K-3619-0", url: kohlerUrl("K-3619-0"), footprint: { wallSpan: 1.7, depth: 2.5 } },
      { id: "K-3981-0", url: kohlerUrl("K-3981-0"), footprint: { wallSpan: 1.7, depth: 2.35 } },
      { id: "K-3940-0", url: kohlerUrl("K-3940-0"), footprint: { wallSpan: 1.7, depth: 2.35 } },
    ],
  },
  {
    id: "paperHolder",
    fixtureKey: "Toilet_Quantity",
    // Beside the toilet at the usual 26 in., clear of the tank.
    // Beside the toilet so it never pokes into the fixture next door (see
    // paperHolderSpot): on the wall behind it where there's room, otherwise
    // turned to face the toilet on the side wall of a corner, or on the
    // side of a shower, vanity or cabinet next to it.
    options: accessoryOptions(PAPER_HOLDERS, "chrome", function (sel, opt, size, ctx) {
      var spot = ctx.paperHolder;
      return spot.facing ? [spot.x, 2.15 - size.y / 2, 1.3] : [spot.x, 2.15 - size.y / 2, 0];
    }).map(function (opt) {
      if (opt.url) {
        opt.pickSpot = true;
        opt.rotationFor = function (ctx) {
          return [0, ctx.paperHolder.facing ? -ctx.paperHolder.side * (Math.PI / 2) : 0, 0];
        };
      }
      return opt;
    }),
  },
  {
    id: "towelBar",
    fixtureKey: "Toilet_Quantity",
    // Over the toilet, about 55 in. up.
    options: accessoryOptions(TOWEL_BARS, "chrome", onWall(0, 4.6)),
  },
  {
    id: "exhaustFan",
    fixtureKey: "Toilet_Quantity",
    options: [
      { id: "none", url: null },
      {
        id: "K-34454-NA",
        url: kohlerUrl("K-34454-NA"),
        material: "porcelain",
        // Converted grille-forward; tipped up so the grille faces the
        // floor, flush with the ceiling over the toilet.
        rotation: [Math.PI / 2, 0, 0],
        place: function (sel, opt, size, ctx) {
          return [0, ctx.heightFt, 1.2 - size.y / 2];
        },
      },
    ],
  },
  {
    id: "tub",
    fixtureKey: "Bathtub_Quantity",
    body: true,
    options: [
      // The freestanding tub PR #9 shipped (Kohler's Stargaze K-24010-0);
      // its footprint is the layout's default one. rimY: top of the back
      // rim; deckZ: that rim's middle.
      {
        id: "freestanding",
        url: "models/fixtures/bathtub.glb",
        mmn: "K-24010-0",
        rimY: 2.08,
        deckZ: 0.235,
        depth: 2.85,
      },
      { id: "K-8332-0", url: kohlerUrl("K-8332-0"), rimY: 1.99, deckZ: 0.1, depth: 2.83 },
      {
        id: "K-1184-0",
        dropIn: "rect",
        url: kohlerUrl("K-1184-0"),
        footprint: { wallSpan: 5.1, depth: 2.75 },
        rimY: 1.65,
        deckZ: 0.145,
      },
      {
        id: "K-R23217-RA-0",
        dropIn: "rect",
        url: kohlerUrl("K-R23217-RA-0"),
        footprint: { wallSpan: 5, depth: 2.6 },
        rimY: 1.21,
        deckZ: 0.15,
      },
      {
        id: "K-R23217-LA-0",
        dropIn: "rect",
        url: kohlerUrl("K-R23217-LA-0"),
        footprint: { wallSpan: 5, depth: 2.6 },
        rimY: 1.21,
        deckZ: 0.15,
      },
      {
        id: "K-1946-RA-0",
        dropIn: "rect",
        url: kohlerUrl("K-1946-RA-0"),
        footprint: { wallSpan: 5, depth: 2.6 },
        rimY: 1.57,
        deckZ: 0.15,
      },
      {
        id: "K-1163-0",
        dropIn: "oval",
        url: kohlerUrl("K-1163-0"),
        footprint: { wallSpan: 5.1, depth: 3.55 },
        rimY: 1.75,
        deckZ: 0.2,
      },
      {
        id: "K-1165-0",
        dropIn: "oval",
        url: kohlerUrl("K-1165-0"),
        footprint: { wallSpan: 6.1, depth: 3.6 },
        rimY: 1.76,
        deckZ: 0.21,
      },
    ],
  },
  {
    id: "tubFaucet",
    fixtureKey: "Bathtub_Quantity",
    options: [
      {
        id: "K-14426-CP",
        url: kohlerUrl("K-14426-CP"),
        material: "chrome",
        place: function (sel) {
          return [0, sel.tub.rimY + 0.2, 0];
        },
      },
      // Needs a deck to stand on: only the drop-in tubs have one.
      {
        id: "K-73081-4-CP",
        url: kohlerUrl("K-73081-4-CP"),
        material: "chrome",
        deckLine: 0.105,
        ownHandles: true,
        available: function (sel) {
          return !!sel.tub.dropIn;
        },
        unavailableReason: "room3d.needsDeck",
        place: function (sel, opt) {
          return [0, sel.tub.rimY, sel.tub.deckZ - opt.deckLine];
        },
      },
      // Floor-mount fillers stand on the room side of the tub, turned so
      // the spout reaches back over it. base: the riser's center in the
      // model (x, z), before that half turn.
      // Only for a freestanding tub (a drop-in's deck is in the way). These
      // are trims with their own handle; the valve in the floor is extra.
      {
        id: "K-T97328-4-CP",
        url: kohlerUrl("K-T97328-4-CP"),
        material: "chrome",
        base: [0.06, 0.2],
        ownHandles: true,
        needsValve: true,
        available: isFreestandingTub,
        unavailableReason: "room3d.needsFreestanding",
      },
      {
        id: "K-T73087-4-CP",
        url: kohlerUrl("K-T73087-4-CP"),
        material: "chrome",
        base: [0.04, 0.22],
        ownHandles: true,
        needsValve: true,
        available: isFreestandingTub,
        unavailableReason: "room3d.needsFreestanding",
      },
    ],
  },
  {
    id: "tubValve",
    fixtureKey: "Bathtub_Quantity",
    // Above the spout (and any grab bar), centered on the tub. A trim by
    // default, since the wall spout needs one; "none" goes last, and is all
    // that's left when the tub faucet has its own handles.
    options: noneLast(
      accessoryOptions(["K-T14501-4-CP", "K-TS14423-4-CP", "K-TS73115-4-CP"], "chrome", function (sel, opt, size) {
        return [0, sel.tub.rimY + 1.4 - size.y / 2, 0];
      }),
    ).map(function (opt) {
      if (opt.url) {
        opt.available = function (sel) {
          return !sel.tubFaucet.ownHandles;
        };
        opt.unavailableReason = "room3d.faucetHasHandles";
      }
      return opt;
    }),
  },
  {
    id: "tubGrabBar",
    fixtureKey: "Bathtub_Quantity",
    options: grabBarOptions(function (sel, opt, size) {
      return [0, sel.tub.rimY + 0.75 - size.y / 2, 0];
    }),
  },
  {
    id: "vanitySink",
    fixtureKey: "Vanity_Quantity",
    options: [
      // centerZ: where the bowl's center sits in the vanity; hole: the
      // countertop cutout's radii, just inside the bowl's top opening;
      // faucetLine: where the faucet's holes go, behind the cutout.
      {
        id: "K-2874-0",
        url: kohlerUrl("K-2874-0"),
        material: "porcelainGloss",
        height: 0.477,
        depth: 1.284,
        centerZ: 0.92,
        hole: { rx: 0.67, rz: 0.54 },
        faucetLine: 0.235,
      },
      {
        id: "K-2608-SU-NA",
        url: kohlerUrl("K-2608-SU-NA"),
        material: "stainless",
        height: 0.492,
        depth: 1.39,
        centerZ: 0.88,
        hole: { rx: 0.68, rz: 0.55 },
        faucetLine: 0.2,
      },
      {
        id: "K-2210-G-0",
        url: kohlerUrl("K-2210-G-0"),
        material: "porcelainGloss",
        height: 0.615,
        depth: 1.342,
        centerZ: 0.92,
        hole: { rx: 0.69, rz: 0.56 },
        faucetLine: 0.22,
      },
      // Drop-in: its rim rests on the countertop instead of hanging under it.
      {
        id: "K-7806-0",
        url: kohlerUrl("K-7806-0"),
        material: "porcelainGloss",
        dropIn: true,
        height: 0.509,
        depth: 1.445,
        centerZ: 0.86,
        hole: { rx: 0.62, rz: 0.62 },
        faucetLine: 0.1,
      },
      // Vanity tops with the bowl cast in: they ARE the countertop, and the
      // cabinet under them is stretched to their size.
      { id: "K-3048-1-0", holes: "single", top: { width: 2.134, depth: 1.853, height: 0.544 }, faucetLine: 0.2 },
      { id: "K-3049-1-0", holes: "single", top: { width: 2.636, depth: 1.853, height: 0.506 }, faucetLine: 0.25 },
      { id: "K-3051-1-0", holes: "single", top: { width: 3.134, depth: 1.859, height: 0.541 }, faucetLine: 0.25 },
      { id: "K-3052-1-0", holes: "single", top: { width: 3.633, depth: 1.853, height: 0.544 }, faucetLine: 0.2 },
      { id: "K-3053-1-0", holes: "single", top: { width: 4.132, depth: 1.859, height: 0.555 }, faucetLine: 0.25 },
      // A stone top cut for an undermount bowl: shown with the Caxton bowl
      // (K-2210-G-0) under its round cutout.
      {
        id: "K-14031-BU-96",
        holes: "single",
        material: "countertop",
        top: { width: 2.583, depth: 1.822, height: 0.063, slab: true },
        faucetLine: 0.2,
        extras: [
          {
            url: kohlerUrl("K-2210-G-0"),
            material: "porcelainGloss",
            place: function () {
              return [0, 2.5 - 0.615, 0.92 - 1.342 / 2];
            },
          },
        ],
      },
    ],
  },
  {
    id: "vanityFaucet",
    fixtureKey: "Vanity_Quantity",
    options: sinkFaucetOptions(
      function (sel) {
        return { y: sel.vanitySink.deckY, line: sel.vanitySink.faucetLine };
      },
      function (sel) {
        return sel.vanitySink;
      },
    ),
  },
  {
    id: "sink",
    fixtureKey: "Sink_Quantity",
    body: true,
    // deckY / faucetLine: the faucet deck's height and hole line. lift:
    // raises a wall-hung model (converted floor-standing) to its rim height.
    options: [
      // The wall-hung sink the room already shows (models/fixtures/sink.glb
      // is this Pinoir).
      { id: "K-2035-4-0", url: null, holes: "centerset", deckY: 2.8, faucetLine: 0.24 },
      { id: "K-2032-0", url: kohlerUrl("K-2032-0"), holes: "centerset", lift: 2.18, deckY: 2.81, faucetLine: 0.38 },
      { id: "K-2362-8-0", url: kohlerUrl("K-2362-8-0"), holes: "widespread", deckY: 2.86, faucetLine: 0.22 },
      { id: "K-5265-4-0", url: kohlerUrl("K-5265-4-0"), holes: "centerset", deckY: 2.94, faucetLine: 0.22 },
    ],
  },
  {
    id: "sinkFaucet",
    fixtureKey: "Sink_Quantity",
    options: sinkFaucetOptions(
      function (sel) {
        return { y: sel.sink.deckY, line: sel.sink.faucetLine };
      },
      function (sel) {
        return sel.sink;
      },
    ),
  },
  {
    id: "showerBase",
    fixtureKey: "Shower_Quantity",
    body: true,
    // width/depth: the base's size; curbY: its threshold height, where a
    // door stands. wide: a 60 in. alcove base (sliding doors, 60 in. walls).
    options: [
      // The glass enclosure and pan the room has always shown.
      { id: "glass-enclosure", url: null, width: 3.2, depth: 3.2, curbY: 0.1 },
      {
        id: "K-8459-0",
        url: kohlerUrl("K-8459-0"),
        wide: true,
        width: 5,
        depth: 2.67,
        curbY: 0.27,
        footprint: { wallSpan: 5, depth: 2.7 },
      },
      {
        id: "K-8458-0",
        url: kohlerUrl("K-8458-0"),
        wide: true,
        width: 5,
        depth: 2.67,
        curbY: 0.27,
        footprint: { wallSpan: 5, depth: 2.7 },
      },
      {
        id: "K-9163-0",
        url: kohlerUrl("K-9163-0"),
        wide: true,
        width: 5,
        depth: 2.65,
        curbY: 0.27,
        footprint: { wallSpan: 5, depth: 2.7 },
      },
      {
        id: "K-9396-0",
        url: kohlerUrl("K-9396-0"),
        width: 3,
        depth: 3,
        curbY: 0.23,
        footprint: { wallSpan: 3.05, depth: 3.05 },
      },
      {
        id: "K-8644-0",
        url: kohlerUrl("K-8644-0"),
        width: 3,
        depth: 2.83,
        curbY: 0.23,
        footprint: { wallSpan: 3.05, depth: 2.9 },
      },
    ],
  },
  {
    id: "showerWalls",
    fixtureKey: "Shower_Quantity",
    // Part of the shower's body (see showerBodyTemplate), only with a
    // Kohler base: the Choreograph kit made for that base's size.
    body: true,
    showIf: function (sel) {
      return !!sel.showerBase.url;
    },
    options: [
      {
        id: "choreograph-72",
        available: isWideBase,
        kit: function () {
          return kohlerUrl("K-97618-0");
        },
      },
      {
        id: "choreograph-96",
        // 96 in. tall: needs at least an 8 ft ceiling.
        available: function () {
          return Layout.computeRoomDimensions(state.dims).heightFt >= 8;
        },
        unavailableReason: "room3d.ceilingTooLow",
        kit: function (base) {
          return kohlerUrl(base.wide ? "K-97615-0" : "K-97611-0");
        },
        // The 96 in. kits' inside corners get the matching corner joints.
        corners: kohlerUrl("K-97635-0"),
      },
    ],
  },
  {
    id: "showerDoor",
    fixtureKey: "Shower_Door_Quantity",
    body: true,
    options: [
      {
        id: "standard-door",
        url: null,
        available: function (sel) {
          return !sel.showerBase.url;
        },
      },
      { id: "K-R706851-8L-BL", url: kohlerUrl("K-R706851-8L-BL"), material: "glass", available: isWideBase },
      { id: "K-707615-8L-BL", url: kohlerUrl("K-707615-8L-BL"), material: "glass", available: isWideBase },
      { id: "K-706015-L-BL", url: kohlerUrl("K-706015-L-BL"), material: "glass", available: isWideBase },
      { id: "K-27582-10L-BL", url: kohlerUrl("K-27582-10L-BL"), material: "glass", available: isNarrowShower },
      { id: "K-27583-10L-BL", url: kohlerUrl("K-27583-10L-BL"), material: "glass", available: isNarrowShower },
    ],
  },
  {
    id: "showerValve",
    fixtureKey: "Shower_Quantity",
    // Centered at a standard 48 in. valve height, just in front of the
    // enclosure's back panel.
    options: ["K-T73117-4-CP", "K-T78027-9-CP", "K-T72770-4-CP"].map(function (id) {
      return {
        id: id,
        url: kohlerUrl(id),
        material: "chrome",
        wallCenterY: 4,
        place: function (sel, opt, size) {
          return [0, opt.wallCenterY - size.y / 2, 0.06];
        },
      };
    }),
  },
  {
    id: "showerHead",
    fixtureKey: "Shower_Quantity",
    // Each head hangs from its arm's tip (arm tip: z out from the wall,
    // y below the flange's top). Replaces the stand-in's own head.
    options: [
      showerHeadOption("K-965-AK-CP", "K-933-CP", { z: 0.67, drop: 0.37 }),
      showerHeadOption("K-24805-CP", "K-933-CP", { z: 0.67, drop: 0.37 }),
      // The Occasion rainhead is modeled tipped 45 degrees; leveled here.
      showerHeadOption("K-27051-CP", "K-26322-CP", { z: 1.12, drop: 0.3 }, [Math.PI / 4, 0, 0]),
      {
        id: "K-22166-CP",
        url: kohlerUrl("K-22166-CP"),
        material: "chrome",
        place: onWall(0.9, 4.4),
      },
    ],
  },
  {
    id: "showerGrabBar",
    fixtureKey: "Shower_Quantity",
    // Only bars that fit between the side walls.
    options: grabBarOptions(
      function (sel, opt, size) {
        return [0, 2.9 - size.y / 2, 0.06];
      },
      function (sel, length) {
        return length <= sel.showerBase.width - 0.2;
      },
    ),
  },
  {
    id: "showerShelf",
    fixtureKey: "Shower_Shelf_Quantity",
    body: true,
    options: [
      { id: "standard-shelf", url: null },
      { id: "K-97621", url: kohlerUrl("K-97621"), material: "porcelain" },
      { id: "K-97622", url: kohlerUrl("K-97622"), material: "porcelain" },
      { id: "K-97623", url: kohlerUrl("K-97623"), material: "porcelain" },
      { id: "K-14440-CP", url: kohlerUrl("K-14440-CP"), material: "glass" },
      // Floor-to-ceiling storage column.
      { id: "K-97630", url: kohlerUrl("K-97630"), material: "porcelain", floorStanding: true },
    ],
  },
  {
    id: "mirror",
    fixtureKey: "Mirror_Quantity",
    body: true,
    options: [
      { id: "standard-mirror", url: null },
      { id: "K-31364-BLL", url: kohlerUrl("K-31364-BLL"), material: "chrome" },
      { id: "K-31367-BLL", url: kohlerUrl("K-31367-BLL"), material: "chrome" },
      { id: "K-31368", url: kohlerUrl("K-31368"), material: "chrome" },
    ],
  },
  {
    id: "mirrorLarge",
    fixtureKey: "Mirror_Huge_Quantity",
    body: true,
    options: [
      { id: "standard-mirror", url: null },
      { id: "K-31365-BLL", url: kohlerUrl("K-31365-BLL"), material: "chrome" },
      { id: "K-31369-BLL", url: kohlerUrl("K-31369-BLL"), material: "chrome" },
      { id: "K-99573-TL-NA", url: kohlerUrl("K-99573-TL-NA"), material: "chrome" },
    ],
  },
  {
    id: "robeHook",
    fixtureKey: "Door_Quantity",
    // On the entry door's room-side face, at about 66 in.; an open archway
    // has no door to hang it on.
    skip: function (p) {
      return p.hasDoor === false;
    },
    options: accessoryOptions(ROBE_HOOKS, "chrome", function (sel, opt, size) {
      return [-0.7, 5.5 - size.y / 2, 0.075];
    }),
  },
];

function showerHeadOption(headId, armId, tip, rotation) {
  return {
    id: headId,
    url: kohlerUrl(headId),
    material: "chrome",
    rotation: rotation,
    anchor: "topCenter",
    place: function () {
      return [0, SHOWER_ARM_TOP_FT - tip.drop + 0.03, tip.z];
    },
    extras: [
      {
        url: kohlerUrl(armId),
        material: "chrome",
        place: function (sel, opt, size) {
          return [0, SHOWER_ARM_TOP_FT - size.y, 0];
        },
      },
    ],
  };
}

// Tub parts that need more than one number to place.
productOption(productSlot("tubFaucet"), "K-T97328-4-CP").rotation = [0, Math.PI, 0];
productOption(productSlot("tubFaucet"), "K-T73087-4-CP").rotation = [0, Math.PI, 0];
["K-T97328-4-CP", "K-T73087-4-CP"].forEach(function (id) {
  var filler = productOption(productSlot("tubFaucet"), id);
  filler.place = function (sel) {
    // The half turn maps the riser's (x, z) to (-x, -z): land it 4 in.
    // in front of the tub's front edge.
    return [filler.base[0], 0, tubDepth(sel.tub) + 0.35 + filler.base[1]];
  };
});

// Sink bowls and vanity tops have no place() of their own: they all hang
// off the 2.5 ft countertop line, laid out here in one spot.
productSlot("vanitySink").options.forEach(function (sink) {
  if (sink.top) {
    sink.url = kohlerUrl(sink.id);
    sink.material = sink.material || "porcelainGloss";
    // A slab is set on the cabinet; a cast-iron top's bowl hangs below its
    // surface, which is level with the other countertops.
    sink.deckY = sink.top.slab ? 2.5 + sink.top.height : 2.6;
    sink.footprint = { wallSpan: sink.top.width + 0.05, depth: sink.top.depth + 0.05 };
    sink.place = function () {
      return [0, sink.deckY - sink.top.height, 0];
    };
    return;
  }
  sink.deckY = 2.6;
  sink.place = function () {
    // Undermount: rim tucked just under the countertop's cutout. Drop-in:
    // rim resting just on top of it.
    var rimY = sink.dropIn ? 2.62 : 2.5;
    return [0, rimY - sink.height, sink.centerZ - sink.depth / 2];
  };
});

function defaultProductPicks() {
  var picks = {};
  PRODUCT_SLOTS.forEach(function (slot) {
    picks[slot.id] = slot.options[0].id;
  });
  return picks;
}

function productSlot(slotId) {
  for (var i = 0; i < PRODUCT_SLOTS.length; i++) if (PRODUCT_SLOTS[i].id === slotId) return PRODUCT_SLOTS[i];
  return null;
}

function productOption(slot, optionId) {
  for (var i = 0; i < slot.options.length; i++) if (slot.options[i].id === optionId) return slot.options[i];
  return null;
}

// Whether any of a slot's options changes its fixture's size.
function slotIsSized(slot) {
  return slot.options.some(function (opt) {
    return !!opt.footprint;
  });
}

// slotId -> the option showing: the pick, unless it doesn't go with an
// earlier slot's (the slot's first option that does, then). Slots are in
// dependency order, so a door sees the base already resolved.
function selectedProducts(picks) {
  picks = picks || state.productPicks;
  var sel = {};
  PRODUCT_SLOTS.forEach(function (slot) {
    var opt = productOption(slot, picks[slot.id]) || slot.options[0];
    if (opt.available && !opt.available(sel)) {
      opt =
        slot.options.filter(function (o) {
          return !o.available || o.available(sel);
        })[0] || opt;
    }
    sel[slot.id] = opt;
  });
  return sel;
}

// Footprint overrides for Layout.computeLayout(): only a pick that
// declares its own size changes anything. picks defaults to
// state.productPicks.
function productFootprints(picks) {
  var sel = selectedProducts(picks);
  var out = {};
  PRODUCT_SLOTS.forEach(function (slot) {
    var opt = sel[slot.id];
    if (opt && opt.footprint) out[slot.fixtureKey] = opt.footprint;
  });
  return out;
}

// productFootprints() for a layout about to be computed from layoutInput
// (no footprints yet), with any sized pick that no longer fits — the room
// shrank, or more fixtures were added — treated as its slot's default, so
// a visual pick never makes a priced fixture disappear from the room or
// fail the estimate's fit check. commit: also put that pick back to the
// default in state (the real rebuild does; checkFit()'s what-if doesn't).
function fittedProductFootprints(layoutInput, commit) {
  var picks = Object.assign({}, state.productPicks);
  PRODUCT_SLOTS.forEach(function (slot) {
    var opt = selectedProducts(picks)[slot.id];
    if (!opt.footprint || opt === slot.options[0]) return;
    var others = productFootprints(picks);
    delete others[slot.fixtureKey];
    if (productWouldDrop(Object.assign({}, layoutInput, { footprints: others }), slot, opt)) {
      picks[slot.id] = slot.options[0].id;
    }
  });
  if (commit) state.productPicks = picks;
  return productFootprints(picks);
}

var productModelLoader = null;

// Fetched lazily — only the picked option of a slot whose fixture is
// actually placed — and cached for the life of the scene, so flipping back
// to an option is instant. s.productModels[url] is the loaded template
// (with its bounding-box size in userData.size), or false while in flight.
function ensureProductModel(s, opt) {
  if (opt.url in s.productModels) return;
  s.productModels[opt.url] = false;
  if (!productModelLoader) productModelLoader = new GLTFLoader();
  productModelLoader.load(
    siteUrl(opt.url),
    function (gltf) {
      var model = gltf.scene;
      var materialKey = opt.material || "porcelainGloss";
      var material = s.mat[materialKey];
      model.traverse(function (child) {
        if (child.isMesh) {
          child.material = material;
          // Porcelain bodies stay retintable by setFixtureFinish(); chrome
          // and steel trim keep their finish.
          if (!opt.material) child.userData.finishBase = materialKey;
        }
      });
      model.userData.size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      s.productModels[opt.url] = model;
      markDirty();
    },
    undefined,
    function (err) {
      console.warn("3D preview: couldn't load " + opt.url + ", leaving it out.", err);
    },
  );
}

// Every model an option places: its own plus any extras.
function optionModels(opt) {
  return opt.url ? [opt].concat(opt.extras || []) : [];
}

// Starts any of these models' fetches; true once all of them are loaded.
function productModelsReady(s, models) {
  var ready = true;
  models.forEach(function (m) {
    ensureProductModel(s, m);
    if (!s.productModels[m.url]) ready = false;
  });
  return ready;
}

// Builds (once per key) and caches a body template.
function cachedBodyTemplate(s, key, build) {
  if (!s.bodyTemplates[key]) s.bodyTemplates[key] = build();
  return s.bodyTemplates[key];
}

// A loaded model wrapped in a group so it can sit offset from the
// fixture's origin.
function offsetModel(model, x, y, z) {
  var g = new THREE.Group();
  var m = model.clone(true);
  m.position.set(x, y, z);
  g.add(m);
  return g;
}

// Whether fixtureKey's body comes from a product slot pick (so parts on it
// wait for that body to load): always for the tub and vanity, and for the
// others once a Kohler model is picked over the stand-in.
function productOwnsBody(fixtureKey, sel) {
  if (fixtureKey === "Bathtub_Quantity" || fixtureKey === "Vanity_Quantity") return true;
  if (fixtureKey === "Toilet_Quantity") return !!sel.toilet.url;
  if (fixtureKey === "Sink_Quantity") return !!sel.sink.url;
  if (fixtureKey === "Shower_Quantity") return !!sel.showerBase.url;
  return false;
}

// The fixture template to clone for fixtureKey, when a product slot owns
// its body: the picked tub, toilet, sink, shower base, door, shelf or
// mirror model, or a vanity cut out for the picked bowl. null = no slot
// owns it, its pick is the stand-in, or its model hasn't arrived yet — so
// the caller keeps whatever it would otherwise use.
function productBodyTemplate(s, fixtureKey, sel) {
  if (fixtureKey === "Bathtub_Quantity") {
    ensureProductModel(s, sel.tub);
    var tub = s.productModels[sel.tub.url];
    if (!tub || !sel.tub.dropIn) return tub || null;
    if (!s.tubTemplates[sel.tub.id]) {
      var g = new THREE.Group();
      g.add(tub.clone(true), buildTubDeck(s.mat, tub.userData.size, sel.tub));
      s.tubTemplates[sel.tub.id] = g;
    }
    return s.tubTemplates[sel.tub.id];
  }
  if (fixtureKey === "Vanity_Quantity") {
    if (!productModelsReady(s, optionModels(sel.vanitySink))) return null;
    var key = sel.vanitySink.id;
    if (!s.vanityTemplates[key]) s.vanityTemplates[key] = buildUndermountVanity(s.geo, s.mat, sel.vanitySink);
    return s.vanityTemplates[key];
  }
  if (fixtureKey === "Toilet_Quantity") {
    if (!sel.toilet.url || !productModelsReady(s, [sel.toilet])) return null;
    return s.productModels[sel.toilet.url];
  }
  if (fixtureKey === "Sink_Quantity") {
    var sink = sel.sink;
    if (!sink.url || !productModelsReady(s, [sink])) return null;
    return cachedBodyTemplate(s, "sink|" + sink.id, function () {
      return offsetModel(s.productModels[sink.url], 0, sink.lift || 0, 0);
    });
  }
  if (fixtureKey === "Shower_Quantity") return showerBodyTemplate(s, sel);
  if (fixtureKey === "Shower_Door_Quantity") {
    var door = sel.showerDoor;
    if (!door.url || !productModelsReady(s, [door])) return null;
    // The door instance sits at the shower's open edge; the panel stands
    // on the base's threshold, centered on that line.
    return cachedBodyTemplate(s, "door|" + door.id + "|" + sel.showerBase.id, function () {
      var model = s.productModels[door.url];
      return offsetModel(model, 0, sel.showerBase.curbY, -model.userData.size.z / 2);
    });
  }
  if (fixtureKey === "Shower_Shelf_Quantity") {
    var shelf = sel.showerShelf;
    if (!shelf.url || !productModelsReady(s, [shelf])) return null;
    // The shelf instance is centered on the shower's back wall at the
    // layout's 48 in. mount height. Kohler shelves go higher and off to one
    // side, clear of the valve; the storage column stands on the floor.
    return cachedBodyTemplate(s, "shelf|" + shelf.id + "|" + sel.showerBase.id, function () {
      var model = s.productModels[shelf.url];
      var size = model.userData.size;
      var mountY = Layout.FIXTURE_LAYOUT.Shower_Shelf_Quantity.mountHeight;
      var x = Math.max(0, sel.showerBase.width / 2 - 0.4 - size.x / 2);
      var y = shelf.floorStanding ? -mountY : 0.9 - size.y / 2;
      return offsetModel(model, x, y, 0.02);
    });
  }
  if (fixtureKey === "Mirror_Quantity" || fixtureKey === "Mirror_Huge_Quantity") {
    var mirror = fixtureKey === "Mirror_Quantity" ? sel.mirror : sel.mirrorLarge;
    if (!mirror.url || !productModelsReady(s, [mirror])) return null;
    // Wall-mounted instances sit at the layout's mountHeight; the Kohler
    // mirror hangs its bottom edge at MIRROR_BOTTOM_FT instead, on the
    // wall's face (its back at z = 0), not sunk into it.
    return cachedBodyTemplate(s, "mirror|" + mirror.id, function () {
      var mountY = Layout.FIXTURE_LAYOUT[fixtureKey].mountHeight;
      return offsetModel(s.productModels[mirror.url], 0, MIRROR_BOTTOM_FT - mountY, 0.005);
    });
  }
  return null;
}

// A Kohler shower: the picked base, and around it the Choreograph wall kit
// made for that base's size (plus corner joints on the 96 in. kits).
function showerBodyTemplate(s, sel) {
  var base = sel.showerBase;
  if (!base.url) return null;
  var walls = sel.showerWalls;
  var kit = { url: walls.kit(base), material: "porcelain" };
  var corners = walls.corners ? { url: walls.corners, material: "porcelain" } : null;
  var models = [base, kit].concat(corners ? [corners] : []);
  if (!productModelsReady(s, models)) return null;
  return cachedBodyTemplate(s, "shower|" + base.id + "|" + kit.url, function () {
    var g = new THREE.Group();
    g.add(s.productModels[base.url].clone(true));
    var kitModel = s.productModels[kit.url].clone(true);
    g.add(kitModel);
    if (corners) {
      var halfW = s.productModels[kit.url].userData.size.x / 2 - 0.04;
      [-halfW, halfW].forEach(function (x) {
        var joint = s.productModels[corners.url].clone(true);
        joint.position.set(x, 0, 0.02);
        g.add(joint);
      });
    }
    return g;
  });
}

// Adds every non-body slot's picked model(s) onto one placed instance.
// Parts on a fixture whose body comes from a slot wait for that body, since
// their positions are measured against it. ctx: { heightFt } of the room.
function addProductParts(s, instance, placement, sel, bodyReady, ctx) {
  var fixtureKey = placement.fixtureKey;
  PRODUCT_SLOTS.forEach(function (slot) {
    if (slot.fixtureKey !== fixtureKey || slot.body) return;
    if (slot.skip && slot.skip(placement)) return;
    var opt = sel[slot.id];
    var models = optionModels(opt);
    if (!models.length || !productModelsReady(s, models) || !bodyReady) return;
    if (opt.pickSpot) ctx.paperHolder = paperHolderSpot(ctx, placement, s.productModels[opt.url].userData.size);
    models.forEach(function (m) {
      var model = s.productModels[m.url];
      var part = model.clone(true);
      var rotation = m.rotationFor ? m.rotationFor(ctx) : m.rotation;
      if (rotation) part.rotation.set(rotation[0], rotation[1], rotation[2]);
      var p = m.place(sel, opt, model.userData.size, ctx);
      part.position.set(p[0], p[1], p[2]);
      if (m.anchor === "topCenter") {
        // Rotated first, so line up by where it actually ends up.
        part.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(part);
        part.position.x += p[0] - (box.min.x + box.max.x) / 2;
        part.position.y += p[1] - box.max.y;
        part.position.z += p[2] - (box.min.z + box.max.z) / 2;
      }
      instance.add(part);
    });
    // A real showerhead replaces the stand-in enclosure's own.
    if (slot.id === "showerHead") {
      instance.traverse(function (child) {
        if (child.userData.standardShowerHead) child.visible = false;
      });
    }
  });
}

// The switcher's fixture tabs: one per placed fixture, each showing only
// that fixture's dropdowns, so the rows never crowd out the room itself.
var PRODUCT_GROUPS = [
  { id: "toilet", fixtureKeys: ["Toilet_Quantity"] },
  { id: "tub", fixtureKeys: ["Bathtub_Quantity"] },
  { id: "vanity", fixtureKeys: ["Vanity_Quantity"] },
  { id: "sink", fixtureKeys: ["Sink_Quantity"] },
  { id: "shower", fixtureKeys: ["Shower_Quantity", "Shower_Door_Quantity", "Shower_Shelf_Quantity"] },
  { id: "mirror", fixtureKeys: ["Mirror_Quantity", "Mirror_Huge_Quantity"] },
  { id: "door", fixtureKeys: ["Door_Quantity"] },
];

function productGroupOf(slot) {
  for (var i = 0; i < PRODUCT_GROUPS.length; i++) {
    if (PRODUCT_GROUPS[i].fixtureKeys.indexOf(slot.fixtureKey) !== -1) return PRODUCT_GROUPS[i].id;
  }
  return null;
}

// A row of fixture tabs, then one labelled dropdown per slot.
function buildProductSwitcher(panel, wrap) {
  var container = document.createElement("div");
  container.className = "ai-chat-room-3d-products";
  container.hidden = true;
  var tabsWrap = document.createElement("div");
  tabsWrap.className = "ai-chat-room-3d-style-switch";
  tabsWrap.setAttribute("role", "group");
  tabsWrap.setAttribute("aria-label", T("room3d.products"));
  var ui = { container: container, rows: {}, tabs: {}, group: null };
  PRODUCT_GROUPS.forEach(function (group) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-chat-room-3d-style-btn";
    btn.textContent = T("room3d.group." + group.id);
    btn.hidden = true;
    btn.addEventListener("click", function () {
      ui.group = group.id;
      applyProductGroup(ui);
    });
    ui.tabs[group.id] = btn;
    tabsWrap.appendChild(btn);
  });
  var rowsWrap = document.createElement("div");
  rowsWrap.className = "ai-chat-room-3d-product-rows";
  PRODUCT_SLOTS.forEach(function (slot) {
    var row = document.createElement("div");
    row.className = "ai-chat-room-3d-product-row";
    row.hidden = true;
    var selectId = "ai-chat-room-3d-product-" + slot.id;
    var label = document.createElement("label");
    label.className = "ai-chat-room-3d-product-label";
    label.htmlFor = selectId;
    label.textContent = T("room3d.slot." + slot.id);
    var select = document.createElement("select");
    select.className = "ai-chat-room-3d-product-select";
    select.id = selectId;
    var options = {};
    slot.options.forEach(function (opt) {
      var el = document.createElement("option");
      el.value = opt.id;
      el.textContent = T("room3d.option." + opt.id);
      options[opt.id] = el;
      select.appendChild(el);
    });
    select.addEventListener("change", function () {
      window.BathroomRoom3D.setProductPick(slot.id, select.value);
    });
    row.appendChild(label);
    row.appendChild(select);
    rowsWrap.appendChild(row);
    ui.rows[slot.id] = { row: row, select: select, options: options, group: productGroupOf(slot), shown: false };
  });
  container.appendChild(tabsWrap);
  container.appendChild(rowsWrap);
  panel.insertBefore(container, wrap);
  return ui;
}

// Shows the tabs of fixtures with something to pick, and the picked tab's
// rows (the first tab, if the picked one's fixture is gone).
function applyProductGroup(ui) {
  var groupsShown = {};
  PRODUCT_SLOTS.forEach(function (slot) {
    var entry = ui.rows[slot.id];
    if (entry.shown) groupsShown[entry.group] = true;
  });
  if (!groupsShown[ui.group]) {
    ui.group = null;
    PRODUCT_GROUPS.forEach(function (group) {
      if (!ui.group && groupsShown[group.id]) ui.group = group.id;
    });
  }
  PRODUCT_GROUPS.forEach(function (group) {
    var btn = ui.tabs[group.id];
    var current = ui.group === group.id;
    btn.hidden = !groupsShown[group.id];
    btn.classList.toggle("selected", current);
    btn.setAttribute("aria-pressed", current ? "true" : "false");
  });
  PRODUCT_SLOTS.forEach(function (slot) {
    var entry = ui.rows[slot.id];
    entry.row.hidden = !entry.shown || entry.group !== ui.group;
  });
  ui.container.hidden = !ui.group;
}

// Reflects what's showing and which fixtures are placed onto the
// dropdowns. An option too big for the room (the layout would drop a
// fixture it otherwise places), or one that doesn't go with another pick,
// is disabled with the reason after its name rather than silently not
// drawn.
function syncProductSwitcher(s, layoutInput, placedKeys, sel) {
  var ui = s.productSwitcher;
  if (!ui) return;
  PRODUCT_SLOTS.forEach(function (slot) {
    var entry = ui.rows[slot.id];
    entry.shown = slotShown(slot, placedKeys, sel);
    slotOptionStates(slot, sel, layoutInput, entry.shown).forEach(function (o) {
      var el = entry.options[o.id];
      el.disabled = !!o.reason;
      el.textContent = o.label + (o.reason ? " (" + o.reason + ")" : "");
    });
    entry.select.value = sel[slot.id].id;
  });
  applyProductGroup(ui);
}

function slotShown(slot, placedKeys, sel) {
  return !!placedKeys[slot.fixtureKey] && (!slot.showIf || slot.showIf(sel));
}

// Each of a slot's options with its label and, when it can't be picked
// right now, why: it doesn't go with another pick, or (for a sized slot
// that's showing) it's too big for the room.
function slotOptionStates(slot, sel, layoutInput, shown) {
  var sized = shown && slotIsSized(slot);
  return slot.options.map(function (opt) {
    var reason = null;
    if (opt.available && !opt.available(sel)) reason = T(opt.unavailableReason || "room3d.noFit");
    else if (sized && sel[slot.id] !== opt && productWouldDrop(layoutInput, slot, opt)) reason = T("room3d.tooBig");
    return { id: opt.id, label: T("room3d.option." + opt.id), reason: reason };
  });
}

// ---------------------------------------------------------------------
// Product picks for the estimate
// ---------------------------------------------------------------------
// The chat's product step (js/script.js) walks the placed fixtures one tab
// at a time, and prices whatever is showing by Kohler model number.

function mmnFromUrl(url) {
  var m = /\/(K-[A-Z0-9-]+)\.glb$/.exec(url || "");
  return m ? m[1] : null;
}

// The Kohler model numbers an option puts in the room: its model and any
// extras (a showerhead's arm, a spout's handles, the bowl under a top),
// or for the walls, the kit (and corner joints) made for the base showing.
// A stand-in or "none" has none.
function optionMmns(slot, opt, sel) {
  var urls;
  if (slot.id === "showerWalls") {
    if (!sel.showerBase.url) return [];
    urls = [opt.kit(sel.showerBase)].concat(opt.corners ? [opt.corners] : []);
  } else {
    urls = optionModels(opt).map(function (m) {
      return m.url;
    });
  }
  var out = urls.map(mmnFromUrl).filter(Boolean);
  if (opt.mmn) out.unshift(opt.mmn);
  // The Pinoir sink is the room's own default model file.
  if (!out.length && !opt.url && /^K-/.test(opt.id)) out.push(opt.id);
  return out;
}

// The layout for the room as it stands in state right now (not the last
// one drawn, which may lag a frame behind a just-entered count).
function currentLayout() {
  var dims = Layout.computeRoomDimensions(state.dims);
  var layoutInput = {
    widthFt: dims.widthFt,
    lengthFt: dims.lengthFt,
    heightFt: dims.heightFt,
    fixtureCounts: state.fixtures,
    plumbingWallIds: state.plumbingWallIds,
    entryPoints: state.entryPoints,
    fixturePositions: state.fixturePositions,
  };
  layoutInput.footprints = fittedProductFootprints(layoutInput, false);
  var layout = Layout.computeLayout(layoutInput);
  var placedKeys = {};
  layout.placements.forEach(function (p) {
    placedKeys[p.fixtureKey] = true;
  });
  return { layoutInput: layoutInput, layout: layout, placedKeys: placedKeys };
}

function productGroupDef(groupId) {
  for (var i = 0; i < PRODUCT_GROUPS.length; i++) if (PRODUCT_GROUPS[i].id === groupId) return PRODUCT_GROUPS[i];
  return null;
}

// Frames every placed instance of a tab's fixtures, from in front of them.
function focusCameraOn(s, group) {
  var box = new THREE.Box3();
  var facing = null;
  s.fixtureGroup.children.forEach(function (inst) {
    if (group.fixtureKeys.indexOf(inst.userData.fixtureKey) === -1) return;
    box.expandByObject(inst);
    if (facing === null) facing = inst.rotation.y;
  });
  if (box.isEmpty()) return false;
  var center = box.getCenter(new THREE.Vector3());
  var size = box.getSize(new THREE.Vector3());
  var dir = new THREE.Vector3(Math.sin(facing), 0.55, Math.cos(facing)).normalize();
  var distance = Math.max(size.x, size.y, size.z) * 1.6 + 3;
  var dims = Layout.computeRoomDimensions(state.dims);
  var diag = Math.sqrt(dims.widthFt * dims.widthFt + dims.lengthFt * dims.lengthFt);
  s.controls.minDistance = Math.min(distance, 2);
  s.controls.maxDistance = Math.max(distance, clamp(diag * 1.9, 12, 160));
  s.cameraLerp = {
    from: s.camera.position.clone(),
    to: center.clone().addScaledVector(dir, distance),
    targetFrom: s.controls.target.clone(),
    targetTo: center,
    start: performance.now(),
    durationMs: 700,
  };
  needsRender = true;
  return true;
}

function productWouldDrop(layoutInput, slot, opt) {
  var footprints = Object.assign({}, layoutInput.footprints);
  if (opt.footprint) footprints[slot.fixtureKey] = opt.footprint;
  else delete footprints[slot.fixtureKey];
  var current = Layout.computeLayout(layoutInput).droppedCounts;
  var withOpt = Layout.computeLayout(Object.assign({}, layoutInput, { footprints: footprints })).droppedCounts;
  // Per fixture type, not a total: a bigger tub that no longer fits could
  // otherwise "free up" room for two other fixtures and look like a win.
  return Object.keys(withOpt).some(function (k) {
    return withOpt[k] > (current[k] || 0);
  });
}

// The deck a drop-in tub is set into: stone side panels from the floor up
// to just under the rim, and a top with a cutout a little inside the rim's
// outer edge — so the rim rests on it and the bare underside of the shell
// is hidden, as it would be installed. Sized from the tub model itself.
function buildTubDeck(mat, size, tub) {
  var w = size.x;
  var d = size.z;
  var topY = tub.rimY - 0.06;
  var g = new THREE.Group();
  var t = 0.05;
  var front = new THREE.Mesh(new THREE.BoxGeometry(w, topY, t), mat.countertop);
  front.position.set(0, topY / 2, d - t / 2);
  var left = new THREE.Mesh(new THREE.BoxGeometry(t, topY, d - t), mat.countertop);
  left.position.set(-w / 2 + t / 2, topY / 2, (d - t) / 2);
  var right = left.clone();
  right.position.x = w / 2 - t / 2;
  // Top plate, drawn in x/y and laid flat like the vanity countertop.
  var shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, -d);
  shape.lineTo(-w / 2, -d);
  shape.closePath();
  var inset = 0.15;
  var hole = new THREE.Path();
  if (tub.dropIn === "oval") {
    hole.absellipse(0, -d / 2, w / 2 - inset, d / 2 - inset, 0, Math.PI * 2, true);
  } else {
    var hx = w / 2 - inset;
    var hz = d - inset;
    var r = 0.3;
    hole.moveTo(-hx + r, -inset);
    hole.lineTo(hx - r, -inset);
    hole.quadraticCurveTo(hx, -inset, hx, -inset - r);
    hole.lineTo(hx, -hz + r);
    hole.quadraticCurveTo(hx, -hz, hx - r, -hz);
    hole.lineTo(-hx + r, -hz);
    hole.quadraticCurveTo(-hx, -hz, -hx, -hz + r);
    hole.lineTo(-hx, -inset - r);
    hole.quadraticCurveTo(-hx, -inset, -hx + r, -inset);
  }
  shape.holes.push(hole);
  var top = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 32 }),
    mat.countertop,
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = topY - 0.04;
  g.add(front, left, right, top);
  return g;
}

// The vanity once a real bowl is going in: the same 2.5 x 2.6 x 1.6 ft
// cabinet, but solid only up to just under the bowl, with thin aprons
// around an open top and a stone countertop with a cutout sized to that
// bowl — so looking down you see into the bowl rather than a solid box
// top. A vanity top (sink.top) is its own countertop: the cabinet is
// stretched to sit just inside it instead, with no stone top.
function buildUndermountVanity(geo, mat, sink) {
  var g = new THREE.Group();
  var cabinet = new THREE.Group();
  var body = new THREE.Mesh(geo.vanityLowerBody, mat.cabinetWood);
  body.position.set(0, 1.0, 0.8);
  var front = new THREE.Mesh(geo.vanityApronX, mat.cabinetWood);
  front.position.set(0, 2.25, 1.575);
  var back = front.clone();
  back.position.z = 0.025;
  var left = new THREE.Mesh(geo.vanityApronZ, mat.cabinetWood);
  left.position.set(-1.225, 2.25, 0.8);
  var right = left.clone();
  right.position.x = 1.225;
  cabinet.add(body, front, back, left, right);
  if (sink.top) {
    cabinet.scale.set((sink.top.width - 0.08) / 2.5, 1, (sink.top.depth - 0.06) / 1.6);
    g.add(cabinet);
    return g;
  }
  var top = new THREE.Mesh(vanityCountertopGeometry(sink), mat.countertop);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, 2.5, 0);
  g.add(cabinet, top);
  return g;
}

function vanityCountertopGeometry(sink) {
  // Drawn in x/y then laid flat (rotation.x = -PI/2 maps y -> -z), so the
  // shape's y runs from 0 at the wall to -1.6 at the front edge.
  var shape = new THREE.Shape();
  shape.moveTo(-1.25, 0);
  shape.lineTo(1.25, 0);
  shape.lineTo(1.25, -1.6);
  shape.lineTo(-1.25, -1.6);
  shape.closePath();
  var hole = new THREE.Path();
  hole.absellipse(0, -sink.centerZ, sink.hole.rx, sink.hole.rz, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 32 });
}

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
  // PRODUCT_SLOTS id -> picked option id (the 3D switcher's buttons).
  productPicks: defaultProductPicks(),
  // Where the customer dragged fixtures to: { fixtureKey: { index:
  // { wallId, offsetFt } } }, see Layout.computeLayout's fixturePositions.
  fixturePositions: {},
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

// Toilet styles: A = skirted two-piece, B = one-piece seamless.
var TOILET_STYLE_LABELS = { A: "room3d.toilet.A", B: "room3d.toilet.B" };

function buildToiletStyleSwitch(panel, wrap) {
  var container = document.createElement("div");
  container.className = "ai-chat-room-3d-style-switch";
  container.hidden = true;
  var buttons = {};
  ["A", "B"].forEach(function (key) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-chat-room-3d-style-btn";
    btn.textContent = T(TOILET_STYLE_LABELS[key]);
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
  toggleBtn.textContent = T("room3d.walkIn");
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
  s.cameraControls.toggleBtn.textContent = T(state.cameraMode === "walkin" ? "room3d.overview" : "room3d.walkIn");
  s.cameraControls.toggleBtn.setAttribute("aria-pressed", state.cameraMode === "walkin" ? "true" : "false");

  var wrap = s.cameraControls.entrySwitch;
  wrap.hidden = placed.length < 2;
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
  placed.forEach(function (p, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-chat-room-3d-style-btn";
    btn.textContent = T("room3d.entry", { n: i + 1 });
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

// ---------------------------------------------------------------------
// Dragging fixtures
// ---------------------------------------------------------------------
// Floor fixtures the customer can drag to a new spot. Entry doors have
// their own wall-click step; mirrors, shelves and shower doors ride along
// with whatever they're attached to.
var DRAGGABLE_FIXTURES = [
  "Toilet_Quantity",
  "Bathtub_Quantity",
  "Shower_Quantity",
  "Vanity_Quantity",
  "Sink_Quantity",
  "Cabinet_Quantity",
];

// Where a fixture being dragged would go with the pointer over floor point
// (x, z): against the nearest wall, at that point along it. fits: the
// layout keeps it there (plumbing walls, fit and clearances all hold)
// without moving or dropping anything else.
function dragTarget(drag, x, z) {
  var dims = Layout.computeRoomDimensions(state.dims);
  var w = dims.widthFt;
  var l = dims.lengthFt;
  x = clamp(x, 0, w);
  z = clamp(z, 0, l);
  var walls = [
    { id: "N", dist: z, offsetFt: x },
    { id: "E", dist: w - x, offsetFt: z },
    { id: "S", dist: l - z, offsetFt: w - x },
    { id: "W", dist: x, offsetFt: l - z },
  ];
  var wall = walls.reduce(function (a, b) {
    return b.dist < a.dist ? b : a;
  });
  wall.offsetFt = Math.round(wall.offsetFt * 100) / 100; // to the nearest 1/8 in. or so
  var base = currentLayout();
  var positions = Object.assign({}, state.fixturePositions);
  positions[drag.fixtureKey] = Object.assign({}, positions[drag.fixtureKey]);
  positions[drag.fixtureKey][drag.index] = { wallId: wall.id, offsetFt: wall.offsetFt };
  var trial = Layout.computeLayout(Object.assign({}, base.layoutInput, { fixturePositions: positions }));
  var moved = null;
  var othersStay = trial.placements.every(function (p) {
    if (p.fixtureKey === drag.fixtureKey && p.index === drag.index) {
      moved = p;
      return true;
    }
    return base.layout.placements.some(function (q) {
      return (
        q.fixtureKey === p.fixtureKey && q.index === p.index && Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6
      );
    });
  });
  var fits =
    !!moved &&
    moved.moved === true &&
    moved.wallId === wall.id &&
    othersStay &&
    trial.placements.length === base.layout.placements.length;
  if (fits)
    return {
      fits: true,
      wallId: wall.id,
      offsetFt: moved.offsetFt,
      x: moved.x,
      z: moved.z,
      rotationY: moved.rotationY,
    };
  // Doesn't fit: still follow the pointer along that wall, marked red.
  var n = WALL_INWARD_NORMAL[wall.id];
  return {
    fits: false,
    wallId: wall.id,
    offsetFt: wall.offsetFt,
    x: wall.id === "E" ? w : wall.id === "W" ? 0 : x,
    z: wall.id === "N" ? 0 : wall.id === "S" ? l : z,
    rotationY: Math.atan2(n.x, n.z),
  };
}

// Moves the dragged fixture to its would-be spot, with a green (fits) or
// red (doesn't) outline around it.
function showDragTarget(s, drag) {
  var t = drag.target;
  if (!t) return;
  drag.instance.position.x = t.x;
  drag.instance.position.z = t.z;
  drag.instance.rotation.y = t.rotationY;
  if (!s.dragOutline) {
    s.dragOutline = new THREE.Box3Helper(new THREE.Box3(), 0x2e8b57);
    s.scene.add(s.dragOutline);
  }
  drag.instance.updateMatrixWorld(true);
  s.dragOutline.box.setFromObject(drag.instance);
  s.dragOutline.material.color.set(t.fits ? 0x2e8b57 : 0xc0392b);
  s.dragOutline.visible = true;
  needsRender = true;
}

function clearDragTarget(s) {
  if (s && s.dragOutline) s.dragOutline.visible = false;
  needsRender = true;
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
    var productSwitcher = buildProductSwitcher(panel, wrap);
    var cameraControls = buildCameraModeControls(panel, wrap);
    var dragHint = document.createElement("p");
    dragHint.className = "ai-chat-room-3d-hint";
    dragHint.textContent = T("room3d.dragHint");
    panel.insertBefore(dragHint, wrap);

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

    // Dragging a floor fixture moves it: along its wall, or onto whichever
    // wall the pointer is nearest. Listened for on the canvas's wrapper in
    // the capture phase, so a press on a fixture never reaches
    // OrbitControls (the room stays put while the fixture moves); a press
    // anywhere else still orbits as before.
    var drag = null;
    var floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    function pointerRay(clientX, clientY) {
      var rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      raycaster.setFromCamera(
        new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      return true;
    }

    function fixtureUnderPointer(clientX, clientY) {
      if (!threeState || !pointerRay(clientX, clientY)) return null;
      var hits = raycaster.intersectObjects(threeState.fixtureGroup.children, true);
      for (var i = 0; i < hits.length; i++) {
        var o = hits[i].object;
        while (o && o.parent !== threeState.fixtureGroup) o = o.parent;
        if (o && o.visible && DRAGGABLE_FIXTURES.indexOf(o.userData.fixtureKey) !== -1) return o;
      }
      return null;
    }

    wrap.addEventListener(
      "pointerdown",
      function (e) {
        if (picking || state.cameraMode !== "orbit" || e.button !== 0) return;
        var instance = fixtureUnderPointer(e.clientX, e.clientY);
        if (!instance) return;
        e.stopPropagation();
        e.preventDefault();
        drag = {
          instance: instance,
          fixtureKey: instance.userData.fixtureKey,
          index: instance.userData.placementIndex,
          pointerId: e.pointerId,
          target: null,
        };
        renderer.domElement.setPointerCapture(e.pointerId);
        wrap.classList.add("is-dragging");
      },
      true,
    );
    renderer.domElement.addEventListener("pointermove", function (e) {
      if (!drag) {
        if (!picking && state.cameraMode === "orbit") {
          wrap.classList.toggle("can-drag", !!fixtureUnderPointer(e.clientX, e.clientY));
        }
        return;
      }
      var hit = new THREE.Vector3();
      if (!pointerRay(e.clientX, e.clientY) || !raycaster.ray.intersectPlane(floorPlane, hit)) return;
      drag.target = dragTarget(drag, hit.x, hit.z);
      showDragTarget(threeState, drag);
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      var done = drag;
      drag = null;
      wrap.classList.remove("is-dragging");
      if (done.target && done.target.fits) {
        var positions = Object.assign({}, state.fixturePositions);
        positions[done.fixtureKey] = Object.assign({}, positions[done.fixtureKey]);
        positions[done.fixtureKey][done.index] = { wallId: done.target.wallId, offsetFt: done.target.offsetFt };
        state.fixturePositions = positions;
      }
      clearDragTarget(threeState);
      markDirty(); // redraws it where it now is, or back where it was
    }
    renderer.domElement.addEventListener("pointerup", endDrag);
    renderer.domElement.addEventListener("pointercancel", endDrag);

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
      realModels: {}, // fixtureKey -> true once its real model replaced the stand-in
      modelRequests: {}, // fixtureKey -> true once its model fetch has started
      productModels: {}, // PRODUCT_SLOTS option url -> loaded template, or false while loading
      vanityTemplates: {}, // vanity sink option id -> buildUndermountVanity() template
      tubTemplates: {}, // drop-in tub option id -> tub model + buildTubDeck()
      bodyTemplates: {}, // productBodyTemplate() cache for the other product bodies
      productSwitcher: productSwitcher,
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

// Fixtures with a flat, tall enough side to hang a paper holder on.
var SIDE_MOUNTS = ["Shower_Quantity", "Vanity_Quantity", "Cabinet_Quantity"];

// Where a paper holder of this size goes beside toilet placement p:
// { side, x, facing }. On the wall behind, a little past the tank, when
// that side has room for it; otherwise turned to face the toilet (facing)
// on a corner's side wall or a tall neighbor's side, at x; failing all of
// that, the roomier side.
function paperHolderSpot(ctx, p, size) {
  var rooms = [1, -1].map(function (side) {
    return { side: side, room: ctx.sideRoom(p, side, 2.3) };
  });
  var behind = rooms.filter(function (r) {
    return r.room.dist >= 1.15 + size.x / 2;
  })[0];
  if (behind) return { side: behind.side, x: behind.side * 1.15, facing: false };
  var beside = rooms.filter(function (r) {
    return r.room.what === "wall" || SIDE_MOUNTS.indexOf(r.room.what) !== -1;
  })[0];
  if (beside) return { side: beside.side, x: beside.side * beside.room.dist, facing: true };
  var roomier = rooms[0].room.dist >= rooms[1].room.dist ? rooms[0] : rooms[1];
  return { side: roomier.side, x: roomier.side * 1.15, facing: false };
}

// A box in a placed fixture's own frame (x along its wall, z out into the
// room), as the room-space axis-aligned box it covers.
function fixtureFrameBox(p, minX, maxX, minZ, maxZ) {
  var c = Math.cos(p.rotationY);
  var sn = Math.sin(p.rotationY);
  var xs = [];
  var zs = [];
  [minX, maxX].forEach(function (lx) {
    [minZ, maxZ].forEach(function (lz) {
      xs.push(p.x + lx * c + lz * sn);
      zs.push(p.z - lx * sn + lz * c);
    });
  });
  return {
    minX: Math.min.apply(null, xs),
    maxX: Math.max.apply(null, xs),
    minZ: Math.min.apply(null, zs),
    maxZ: Math.max.apply(null, zs),
  };
}

function rebuildFixtures(s, widthFt, lengthFt, heightFt) {
  while (s.fixtureGroup.children.length) {
    var old = s.fixtureGroup.children[0];
    disposeFixtureInstance(old);
    s.fixtureGroup.remove(old);
  }
  var layoutInput = {
    widthFt: widthFt,
    lengthFt: lengthFt,
    heightFt: heightFt,
    fixtureCounts: state.fixtures,
    plumbingWallIds: state.plumbingWallIds,
    entryPoints: state.entryPoints,
    fixturePositions: state.fixturePositions,
  };
  layoutInput.footprints = fittedProductFootprints(layoutInput, true);
  var layout = Layout.computeLayout(layoutInput);
  s.lastEntryPlacements = layout.placements.filter(function (p) {
    return p.fixtureKey === "Door_Quantity";
  });
  var toiletCount = 0;
  var placedKeys = {};
  var sel = selectedProducts();
  var ctx = {
    heightFt: heightFt,
    // How much room a fixture has on one side (side: +1 = along its wall's
    // direction, -1 = back toward the wall's start), within `depth` ft of
    // the wall: { dist: from its centerline to the nearest thing, what:
    // "wall" (the room's corner) or the fixtureKey in the way }.
    sideRoom: function (p, side, depth) {
      var span = p.wallId === "N" || p.wallId === "S" ? widthFt : lengthFt;
      var room = { dist: side > 0 ? span - p.offsetFt : p.offsetFt, what: "wall" };
      var c = Math.cos(p.rotationY);
      var sn = Math.sin(p.rotationY);
      layout.placements.forEach(function (q) {
        if (q === p) return;
        var fp =
          (layoutInput.footprints && layoutInput.footprints[q.fixtureKey]) || Layout.FIXTURE_LAYOUT[q.fixtureKey];
        if (!fp || (fp.mount !== "floor" && q.fixtureKey !== "Shower_Door_Quantity")) return;
        var z0 = q.depthOffset || 0;
        var box = fixtureFrameBox(q, -fp.wallSpan / 2, fp.wallSpan / 2, z0, z0 + (fp.depth || 0.1));
        // That box's corners in p's own frame.
        var lx = [];
        var lz = [];
        [box.minX, box.maxX].forEach(function (wx) {
          [box.minZ, box.maxZ].forEach(function (wz) {
            lx.push((wx - p.x) * c - (wz - p.z) * sn);
            lz.push((wx - p.x) * sn + (wz - p.z) * c);
          });
        });
        if (Math.max.apply(null, lz) <= 0 || Math.min.apply(null, lz) >= depth) return;
        var near = side > 0 ? Math.min.apply(null, lx) : -Math.max.apply(null, lx);
        if (near > 0 && near < room.dist) room = { dist: near, what: q.fixtureKey };
      });
      return room;
    },
  };
  layout.placements.forEach(function (p) {
    placedKeys[p.fixtureKey] = true;
    ensureFixtureModel(s, p.fixtureKey);
    var productBody = productBodyTemplate(s, p.fixtureKey, sel);
    // An entry point without a door renders as a trimmed open archway —
    // no slab or knob — instead of the normal door template.
    var archway = p.fixtureKey === "Door_Quantity" && p.hasDoor === false;
    var template = archway
      ? s.fixtureTemplates.Door_Quantity_Archway
      : productBody ||
        (p.fixtureKey === "Toilet_Quantity"
          ? s.toiletTemplates[state.selectedToiletStyle]
          : s.fixtureTemplates[p.fixtureKey]);
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
    addProductParts(s, instance, p, sel, !productOwnsBody(p.fixtureKey, sel) || !!productBody, ctx);
    instance.position.set(p.x, y, p.z);
    instance.rotation.y = p.rotationY;
    if (p.depthOffset) {
      instance.translateZ(p.depthOffset);
    }
    // setFixtureFinish() looks instances up by this to retint in place
    // without a full rebuild — see updateFixtureFinishInstances().
    instance.userData.fixtureKey = p.fixtureKey;
    instance.userData.placementIndex = p.index;
    var finish = state.fixtureFinishes[p.fixtureKey];
    if (finish != null) applyFixtureFinish(instance, p.fixtureKey, s.mat, finish);
    setShadowFlags(instance);
    s.fixtureGroup.add(instance);
  });
  // The style switch only chooses between stand-ins: hidden once a real
  // toilet (the default model or a Kohler pick) is showing.
  if (s.toiletStyleSwitch)
    s.toiletStyleSwitch.hidden = toiletCount === 0 || !!s.realModels.Toilet_Quantity || !!sel.toilet.url;
  syncProductSwitcher(s, layoutInput, placedKeys, sel);
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
  // A focus move (focusCameraOn) turns to look at the fixture as it goes.
  if (s.cameraLerp.targetTo) s.controls.target.lerpVectors(s.cameraLerp.targetFrom, s.cameraLerp.targetTo, eased);
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
  rebuildFixtures(s, dims.widthFt, dims.lengthFt, dims.heightFt);
  if (s.pendingFocus) {
    focusCameraOn(s, s.pendingFocus);
    s.pendingFocus = null;
  }
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

// Called after every redraw of the room (a pick, a drag, new counts or
// sizes), so the chat can keep its own dropdowns and the estimate in step
// with what the room shows. See onChange().
var changeListeners = [];

function notifyChange() {
  changeListeners.slice().forEach(function (fn) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  });
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
          notifyChange();
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
      productPicks: defaultProductPicks(),
      fixturePositions: {},
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
    var layoutInput = {
      widthFt: dims.widthFt,
      lengthFt: dims.lengthFt,
      heightFt: dims.heightFt,
      fixtureCounts: fixtureCounts,
      plumbingWallIds: state.plumbingWallIds,
      entryPoints: state.entryPoints,
      fixturePositions: state.fixturePositions,
    };
    layoutInput.footprints = fittedProductFootprints(layoutInput, false);
    var result = Layout.computeLayout(layoutInput);
    return result.droppedCounts;
  },

  // Applies once a real product is picked for this category in the chat's
  // materials flow — retints every placed instance of that fixture type
  // toward colorHex (see applyFixtureFinish()/FIXTURE_FINISH_MATERIAL_KEY
  // above). colorHex is typically MaterialsPricing.guessFinishColor()'s
  // result; pass null/undefined to clear back to the default color (e.g.
  // if the pick is changed to a product with no recognizable finish word).
  // The 3D product switcher (PRODUCT_SLOTS): shows optionId in slotId's
  // place. Unknown ids are ignored. With the Kohler picks on, these are
  // what the estimate prices (getProductPricingItems()).
  setProductPick: function (slotId, optionId) {
    var slot = productSlot(slotId);
    if (!slot || !productOption(slot, optionId) || state.productPicks[slotId] === optionId) return;
    state.productPicks[slotId] = optionId;
    markDirty();
  },

  // Calls fn after every redraw of the room. Returns a function that stops
  // calling it.
  onChange: function (fn) {
    changeListeners.push(fn);
    return function () {
      changeListeners = changeListeners.filter(function (other) {
        return other !== fn;
      });
    };
  },

  getProductPicks: function () {
    return Object.assign({}, state.productPicks);
  },

  // The customer's room as plain data, for saving in this browser: the
  // answers that shape it, the plumbing walls and doorways, the products
  // picked in the switcher and where fixtures were dragged.
  getDesign: function () {
    return JSON.parse(
      JSON.stringify({
        scope: state.scope,
        dims: state.dims,
        fixtures: state.fixtures,
        toiletStyle: state.selectedToiletStyle,
        plumbingWallIds: state.plumbingWallIds,
        entryPoints: state.entryPoints,
        productPicks: state.productPicks,
        fixturePositions: state.fixturePositions,
      }),
    );
  },

  // Puts a getDesign() result back. Anything that no longer exists (a
  // product taken off the list, a wall id from an older version) is left
  // at its default instead.
  loadDesign: function (design) {
    if (!design || typeof design !== "object") return;
    var obj = function (v) {
      return v && typeof v === "object" && !Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : {};
    };
    var picks = defaultProductPicks();
    var saved = obj(design.productPicks);
    Object.keys(saved).forEach(function (slotId) {
      var slot = productSlot(slotId);
      if (slot && productOption(slot, saved[slotId])) picks[slotId] = saved[slotId];
    });
    var dims = obj(design.dims);
    state.scope = obj(design.scope);
    state.dims = { widthFt: dims.widthFt || null, lengthFt: dims.lengthFt || null, heightFt: dims.heightFt || null };
    state.fixtures = obj(design.fixtures);
    state.selectedToiletStyle = design.toiletStyle === "B" ? "B" : "A";
    state.plumbingWallIds = (Array.isArray(design.plumbingWallIds) ? design.plumbingWallIds : []).filter(function (id) {
      return ["N", "E", "S", "W"].indexOf(id) !== -1;
    });
    var size = Layout.computeRoomDimensions(state.dims);
    state.entryPoints = (Array.isArray(design.entryPoints) ? design.entryPoints : [])
      .filter(function (ep) {
        return ep && ["N", "E", "S", "W"].indexOf(ep.wallId) !== -1 && isFinite(ep.offsetFt);
      })
      .slice(0, 4)
      .map(function (ep) {
        var span = wallSpanFor(ep.wallId, size.widthFt, size.lengthFt);
        return {
          wallId: ep.wallId,
          offsetFt: Layout.clampEntryOffset(span, +ep.offsetFt),
          hasDoor: ep.hasDoor !== false,
        };
      });
    state.productPicks = picks;
    state.fixturePositions = obj(design.fixturePositions);
    if (threeState && threeState.toiletStyleSwitch) {
      Array.prototype.forEach.call(threeState.toiletStyleSwitch.children, function (btn, i) {
        var on = (i === 0 ? "A" : "B") === state.selectedToiletStyle;
        btn.classList.toggle("selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    markDirty();
  },

  // Where the customer has dragged fixtures to (see state.fixturePositions).
  getFixturePositions: function () {
    return JSON.parse(JSON.stringify(state.fixturePositions));
  },

  // The page coordinates of a placed fixture's center, or of a floor point
  // (feet) when given one — where a pointer would press to drag it (the
  // browser tests drive dragging through this).
  screenPoint: function (fixtureKey, floorX, floorZ) {
    var s = threeState;
    if (!s) return null;
    var p;
    if (fixtureKey) {
      var inst = s.fixtureGroup.children.filter(function (c) {
        return c.userData.fixtureKey === fixtureKey;
      })[0];
      if (!inst) return null;
      p = new THREE.Box3().setFromObject(inst).getCenter(new THREE.Vector3());
    } else {
      p = new THREE.Vector3(floorX, 0, floorZ);
    }
    p.project(s.camera);
    var rect = s.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  },

  // The switcher's tabs for the fixtures placed right now, in order, each
  // with its dropdowns: [{ id, label, slots: [{ id, label, value,
  // options: [{ id, label, reason }] }] }]. reason is set on an option that
  // can't be picked, saying why.
  getProductGroups: function () {
    var cur = currentLayout();
    var sel = selectedProducts();
    return PRODUCT_GROUPS.map(function (group) {
      var slots = PRODUCT_SLOTS.filter(function (slot) {
        return productGroupOf(slot) === group.id && slotShown(slot, cur.placedKeys, sel);
      }).map(function (slot) {
        return {
          id: slot.id,
          label: T("room3d.slot." + slot.id),
          value: sel[slot.id].id,
          options: slotOptionStates(slot, sel, cur.layoutInput, true),
        };
      });
      return { id: group.id, label: T("room3d.group." + group.id), slots: slots };
    }).filter(function (g) {
      return g.slots.length > 0;
    });
  },

  // Swaps any stand-in still showing in this tab (the generic toilet, the
  // glass enclosure, the plain mirror) for its first Kohler product that
  // fits, so every fixture in it has a real product to price.
  useRealProducts: function (groupId) {
    var changed = false;
    PRODUCT_SLOTS.forEach(function (slot) {
      if (!slot.body || productGroupOf(slot) !== groupId) return;
      var sel = selectedProducts();
      if (optionMmns(slot, sel[slot.id], sel).length) return;
      var layoutInput = currentLayout().layoutInput;
      var pick = slot.options.filter(function (opt) {
        return (
          optionMmns(slot, opt, sel).length &&
          (!opt.available || opt.available(sel)) &&
          !productWouldDrop(layoutInput, slot, opt)
        );
      })[0];
      if (pick) {
        state.productPicks[slot.id] = pick.id;
        changed = true;
      }
    });
    if (changed) markDirty();
  },

  // Turns the camera to frame a tab's fixtures, and shows that tab above
  // the canvas; null goes back to the whole-room overview. Returns whether
  // there was anything to frame.
  focusProductGroup: function (groupId) {
    var s = threeState;
    if (!s) return false;
    if (!groupId) {
      applyCameraMode(s);
      return true;
    }
    var group = productGroupDef(groupId);
    if (!group) return false;
    if (state.cameraMode === "walkin") {
      state.cameraMode = "orbit";
      syncCameraControls(s);
    }
    if (s.productSwitcher) {
      s.productSwitcher.group = groupId;
      applyProductGroup(s.productSwitcher);
    }
    // The fixtures may not be drawn yet (counts just entered): frame them
    // once the next rebuild has placed them.
    if (dirty) {
      s.pendingFocus = group;
      return true;
    }
    return focusCameraOn(s, group);
  },

  // What to price: one item per showing product slot of each placed
  // fixture, with the Kohler model numbers it puts in the room and how many
  // of that fixture are placed. [{ groupId, slotId, slotLabel, optionId,
  // productLabel, mmns: [...], qty }]. A stand-in with no Kohler product
  // (the glass enclosure, the plain shower door) comes with no mmns, so the
  // estimate can say it isn't priced instead of leaving it out silently.
  getProductPricingItems: function () {
    var cur = currentLayout();
    var sel = selectedProducts();
    var items = [];
    PRODUCT_SLOTS.forEach(function (slot) {
      if (!slotShown(slot, cur.placedKeys, sel)) return;
      var opt = sel[slot.id];
      var mmns = optionMmns(slot, opt, sel);
      if (!mmns.length && (opt.id === "none" || slot.id === "showerWalls")) return;
      var qty = cur.layout.placements.filter(function (p) {
        return p.fixtureKey === slot.fixtureKey && !(slot.skip && slot.skip(p));
      }).length;
      if (!qty) return;
      items.push({
        groupId: productGroupOf(slot),
        slotId: slot.id,
        slotLabel: T("room3d.slot." + slot.id),
        optionId: opt.id,
        productLabel: T("room3d.option." + opt.id),
        mmns: mmns,
        qty: qty,
        needsValve: !!opt.needsValve,
      });
    });
    return items;
  },

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
