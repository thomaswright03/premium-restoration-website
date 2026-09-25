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
// Subway tile (3 x 6in, light grout) drawn once on a canvas, for the
// shower's back wall.
function subwayTileTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#d9d6cf";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#f7f6f2";
  var tw = 128;
  var th = 64;
  for (var row = 0; row < 4; row++) {
    for (var col = -1; col < 3; col++) {
      var x = col * tw + (row % 2 ? tw / 2 : 0);
      ctx.fillRect(x + 2, row * th + 2, tw - 4, th - 4);
    }
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // 256px = 12in across (two tiles) and 12in tall (four courses).
  tex.repeat.set(3, 7);
  return tex;
}

function buildMaterials(isDark) {
  var acrylic = new THREE.MeshPhysicalMaterial({
    color: isDark ? 0xe6e4de : 0xfbfaf7,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
  });
  var wood = new THREE.MeshStandardMaterial({ color: 0x7a5638, roughness: 0.6, metalness: 0 });
  var woodDark = new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 0.8, metalness: 0 });
  var paintedWhite = new THREE.MeshStandardMaterial({ color: isDark ? 0xdcd9d2 : 0xf3f1ec, roughness: 0.55 });
  var quartz = new THREE.MeshPhysicalMaterial({
    color: 0xeeebe5,
    roughness: 0.25,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  });
  var stone = new THREE.MeshStandardMaterial({ color: 0xe4ded3, roughness: 0.4 });
  var nicheBack = new THREE.MeshStandardMaterial({ color: 0x8f877c, roughness: 0.5 });
  var showerTile = new THREE.MeshStandardMaterial({ map: subwayTileTexture(), roughness: 0.3 });
  // Clear tempered glass: nearly invisible, with a faint green-blue edge
  // tint and environment reflections. Not written to the depth buffer so
  // fixtures behind it still draw.
  var glassClear = new THREE.MeshPhysicalMaterial({
    color: 0xdff0ee,
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  var mirror = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.02, metalness: 1 });
  var brushedMetal = new THREE.MeshStandardMaterial({ color: 0xb9b6b0, roughness: 0.35, metalness: 1 });
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
  var materials = {
    acrylic: acrylic,
    wood: wood,
    woodDark: woodDark,
    paintedWhite: paintedWhite,
    quartz: quartz,
    stone: stone,
    nicheBack: nicheBack,
    showerTile: showerTile,
    glassClear: glassClear,
    mirror: mirror,
    brushedMetal: brushedMetal,
    porcelainGloss: porcelainGloss,
    // Sink bowls are open lathe shells seen from inside.
    porcelainInside: porcelainGloss.clone(),
    seatResin: seatResin,
    chrome: chrome,
  };
  materials.porcelainInside.side = THREE.DoubleSide;
  return materials;
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
  return { toilet: buildToiletGeometries() };
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

// ---------------------------------------------------------------------
// Every other fixture, built at real size from Layout.REAL_SIZE_IN (inches,
// converted with inch() below) — the same numbers the layout reserves
// floor/wall space with. Same convention as the toilet: floor fixtures have
// their origin on the wall at floor level, x centered, z growing into the
// room; wall-mounted ones (mirrors, niche) are centered on their origin.
// ---------------------------------------------------------------------
var inch = function (n) {
  return n / 12;
};

function realSize(key) {
  return Layout.REAL_SIZE_IN[key];
}

// A rounded rectangle centered on the origin, for extruded outlines and
// the holes cut in them (tub rim, countertop and sink cutouts).
function roundedRectPath(path, width, depth, radius) {
  var w2 = width / 2;
  var d2 = depth / 2;
  var r = Math.min(radius, w2, d2);
  path.moveTo(-w2 + r, -d2);
  path.lineTo(w2 - r, -d2);
  path.quadraticCurveTo(w2, -d2, w2, -d2 + r);
  path.lineTo(w2, d2 - r);
  path.quadraticCurveTo(w2, d2, w2 - r, d2);
  path.lineTo(-w2 + r, d2);
  path.quadraticCurveTo(-w2, d2, -w2, d2 - r);
  path.lineTo(-w2, -d2 + r);
  path.quadraticCurveTo(-w2, -d2, -w2 + r, -d2);
  return path;
}

function ellipsePath(path, rx, rz, cz) {
  path.absellipse(0, cz || 0, rx, rz, 0, Math.PI * 2, false, 0);
  return path;
}

// Extrudes a plan-view outline (x across, second coordinate = depth into
// the room) straight up from yBottom to yTop, with any holes cut through —
// how the tub shell, countertop and pedestal-sink top are made.
function planSlabGeometry(shape, yBottom, yTop, zCenter) {
  var geo = new THREE.ExtrudeGeometry(shape, { depth: yTop - yBottom, bevelEnabled: false, curveSegments: 20 });
  geo.rotateX(Math.PI / 2); // shape y -> +z, extrusion -> downward
  geo.translate(0, yTop, zCenter);
  geo.computeVertexNormals();
  return geo;
}

// A flat, upward-facing plan-view shape at height y (a tub or shower floor).
function planFloorGeometry(shape, y, zCenter) {
  var geo = new THREE.ShapeGeometry(shape, 20);
  geo.rotateX(-Math.PI / 2); // faces up; shape y -> -z (shapes here are symmetric)
  geo.translate(0, y, zCenter);
  geo.computeVertexNormals();
  return geo;
}

// A bowl under a sink cutout: revolved from the rim radius down to a flat
// bottom, stretched front-to-back into the cutout's oval.
function sinkBowlGeometry(rx, rz, depth) {
  var geo = latheProfileGeometry(
    [
      [rx, 0],
      [rx * 0.97, -depth * 0.35],
      [rx * 0.85, -depth * 0.7],
      [rx * 0.55, -depth * 0.95],
      [0, -depth],
    ],
    rz / rx,
    40,
  );
  return geo;
}

function mesh(geometry, material, x, y, z) {
  var m = new THREE.Mesh(geometry, material);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}

function box(w, h, d, material, x, y, z) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

// A shaker-style door or drawer front, facing +z, centered on (x, y) with
// its back face at z: a flat center panel inside a raised frame.
function shakerFront(w, h, material, x, y, z) {
  var g = new THREE.Group();
  var rail = Math.min(inch(2.5), w / 4, h / 4);
  var t = inch(0.75);
  g.add(box(w, rail, t, material, 0, h / 2 - rail / 2, t / 2));
  g.add(box(w, rail, t, material, 0, -h / 2 + rail / 2, t / 2));
  g.add(box(rail, h - 2 * rail, t, material, -w / 2 + rail / 2, 0, t / 2));
  g.add(box(rail, h - 2 * rail, t, material, w / 2 - rail / 2, 0, t / 2));
  g.add(box(w - 2 * rail, h - 2 * rail, inch(0.4), material, 0, 0, inch(0.2)));
  g.position.set(x, y, z);
  return g;
}

// A bar pull: a short chrome rod on two posts, horizontal or vertical.
function barPull(mat, lengthIn, vertical, x, y, z) {
  var g = new THREE.Group();
  var len = inch(lengthIn);
  var rod = mesh(new THREE.CylinderGeometry(inch(0.22), inch(0.22), len, 10), mat.chrome, 0, 0, inch(1));
  if (!vertical) rod.rotation.z = Math.PI / 2;
  g.add(rod);
  [-1, 1].forEach(function (sgn) {
    var post = mesh(new THREE.CylinderGeometry(inch(0.18), inch(0.18), inch(1), 8), mat.chrome);
    post.rotation.x = Math.PI / 2;
    post.position.set(vertical ? 0 : (sgn * len) / 2.4, vertical ? (sgn * len) / 2.4 : 0, inch(0.5));
    g.add(post);
  });
  g.position.set(x, y, z);
  return g;
}

// A single-hole gooseneck faucet sitting on a deck at height y, set back to z.
function faucet(mat, y, z) {
  var g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(inch(1.1), inch(1.2), inch(1.5), 20), mat.chrome, 0, y + inch(0.75), z));
  var neck = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y + inch(1.5), z),
    new THREE.Vector3(0, y + inch(8), z),
    new THREE.Vector3(0, y + inch(10), z + inch(2.5)),
    new THREE.Vector3(0, y + inch(8.5), z + inch(5)),
    new THREE.Vector3(0, y + inch(6.5), z + inch(5.3)),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 32, inch(0.45), 12, false), mat.chrome));
  var lever = mesh(new THREE.CapsuleGeometry(inch(0.25), inch(3), 4, 8), mat.chrome, inch(1.2), y + inch(3), z);
  lever.rotation.z = -Math.PI / 2.6;
  g.add(lever);
  return g;
}

// Alcove bathtub: a glossy acrylic shell with an apron front, an oval-ended
// basin, drain + overflow at one end, and a wall spout and valve above it.
function buildBathtub(geo, mat) {
  var r = realSize("Bathtub_Quantity");
  var W = inch(r.width);
  var D = inch(r.depth);
  var H = inch(r.height);
  var g = new THREE.Group();
  var outer = roundedRectPath(new THREE.Shape(), W, D, inch(1));
  var basinW = W - inch(8);
  var basinD = D - inch(8);
  outer.holes.push(roundedRectPath(new THREE.Path(), basinW, basinD, inch(8)));
  g.add(new THREE.Mesh(planSlabGeometry(outer, 0, H, D / 2), mat.acrylic));
  var floorShape = roundedRectPath(new THREE.Shape(), basinW, basinD, inch(8));
  g.add(new THREE.Mesh(planFloorGeometry(floorShape, inch(2), D / 2), mat.acrylic));
  // Drain end (left): drain, overflow plate, spout and valve on the wall.
  var drainX = -W / 2 + inch(10);
  g.add(mesh(new THREE.CylinderGeometry(inch(1.4), inch(1.4), inch(0.2), 20), mat.chrome, drainX, inch(2.1), D / 2));
  var overflow = mesh(new THREE.CylinderGeometry(inch(1.4), inch(1.4), inch(0.3), 20), mat.chrome);
  overflow.rotation.z = Math.PI / 2;
  overflow.position.set(-basinW / 2 + inch(0.2), H - inch(5), D / 2);
  g.add(overflow);
  var spout = mesh(
    new THREE.CylinderGeometry(inch(0.8), inch(0.9), inch(6), 16),
    mat.chrome,
    drainX,
    H + inch(5),
    inch(3),
  );
  spout.rotation.x = Math.PI / 2;
  g.add(spout);
  var trim = mesh(
    new THREE.CylinderGeometry(inch(3.5), inch(3.5), inch(0.4), 28),
    mat.chrome,
    drainX,
    H + inch(16),
    inch(0.2),
  );
  trim.rotation.x = Math.PI / 2;
  g.add(trim);
  var handle = mesh(new THREE.CapsuleGeometry(inch(0.35), inch(3), 4, 8), mat.chrome, drainX, H + inch(16), inch(1.2));
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  return g;
}

// 36 x 36in stall: an acrylic base with a front curb and center drain,
// subway tile on the back wall, frameless glass sides in chrome channels,
// a valve and a shower head. The front is left open for a paired shower
// door (Shower_Door_Quantity), which attaches at z = depth.
function buildShower(geo, mat) {
  var r = realSize("Shower_Quantity");
  var W = inch(r.width);
  var D = inch(r.depth);
  var H = inch(r.height);
  var baseH = inch(3);
  var g = new THREE.Group();
  g.add(box(W, baseH, D, mat.acrylic, 0, baseH / 2, D / 2));
  g.add(box(W, inch(2), inch(3), mat.acrylic, 0, baseH + inch(1), D - inch(1.5)));
  g.add(box(inch(4), inch(0.15), inch(4), mat.chrome, 0, baseH + inch(0.08), D / 2));
  var tileH = H + inch(6) - baseH;
  var tile = box(W, tileH, inch(0.5), mat.showerTile, 0, baseH + tileH / 2, inch(0.25));
  g.add(tile);
  var glassH = H - baseH;
  [-1, 1].forEach(function (sgn) {
    var side = box(
      inch(0.4),
      glassH,
      D - inch(0.5),
      mat.glassClear,
      (sgn * (W - inch(0.4))) / 2,
      baseH + glassH / 2,
      D / 2 + inch(0.25),
    );
    g.add(side);
    g.add(box(inch(0.8), glassH, inch(0.8), mat.chrome, (sgn * (W - inch(0.8))) / 2, baseH + glassH / 2, inch(0.9)));
  });
  // Valve trim at 48in, shower head arm at 80in.
  var valve = mesh(new THREE.CylinderGeometry(inch(3.5), inch(3.5), inch(0.4), 28), mat.chrome, 0, inch(48), inch(0.7));
  valve.rotation.x = Math.PI / 2;
  g.add(valve);
  var valveLever = mesh(new THREE.CapsuleGeometry(inch(0.35), inch(3), 4, 8), mat.chrome, 0, inch(48), inch(1.6));
  valveLever.rotation.z = Math.PI / 2;
  g.add(valveLever);
  var armLen = inch(8);
  var arm = mesh(
    new THREE.CylinderGeometry(inch(0.4), inch(0.4), armLen, 10),
    mat.chrome,
    0,
    inch(78),
    inch(0.5) + armLen / 2,
  );
  arm.rotation.x = Math.PI / 2.4;
  g.add(arm);
  var head = mesh(
    new THREE.CylinderGeometry(inch(3), inch(2.4), inch(0.8), 28),
    mat.chrome,
    0,
    inch(76),
    inch(0.5) + armLen,
  );
  head.rotation.x = -Math.PI / 12;
  g.add(head);
  return g;
}

// Frameless glass front for the stall: a 12in fixed panel and a 24in
// hinged door with chrome hinges, a towel-bar handle and a bottom sweep.
// Origin is the stall's front edge (placed at the shower's depth).
function buildShowerDoor(geo, mat) {
  var r = realSize("Shower_Door_Quantity");
  var W = inch(r.width);
  var H = inch(r.height);
  var baseH = inch(5);
  var g = new THREE.Group();
  var fixedW = inch(12);
  var doorW = W - fixedW - inch(0.5);
  g.add(box(fixedW, H - inch(3), inch(0.4), mat.glassClear, -W / 2 + fixedW / 2, baseH + (H - inch(3)) / 2, 0));
  var doorX = W / 2 - doorW / 2;
  g.add(box(doorW, H - inch(3), inch(0.4), mat.glassClear, doorX, baseH + (H - inch(3)) / 2, inch(0.2)));
  [inch(12), H - inch(15)].forEach(function (y) {
    g.add(box(inch(2.5), inch(4), inch(1), mat.chrome, W / 2 - inch(1), baseH + y, inch(0.2)));
  });
  g.add(barPull(mat, 12, true, doorX - doorW / 2 + inch(3), baseH + inch(36), inch(0.4)));
  g.add(box(doorW, inch(0.6), inch(0.8), mat.chrome, doorX, baseH + inch(0.3), inch(0.2)));
  return g;
}

// 30in single-sink vanity: wood cabinet on a recessed toe kick, a drawer
// front over two shaker doors with bar pulls, a quartz top with a 4in
// backsplash and an undermount oval bowl, and a gooseneck faucet.
function buildVanity(geo, mat) {
  var r = realSize("Vanity_Quantity");
  var W = inch(r.width);
  var D = inch(r.depth);
  var H = inch(r.height);
  var topT = inch(1.25);
  var kickH = inch(4);
  var bodyD = D - inch(1.5);
  var bodyH = H - topT - kickH;
  var g = new THREE.Group();
  g.add(box(W - inch(1), kickH, bodyD - inch(3), mat.woodDark, 0, kickH / 2, (bodyD - inch(3)) / 2));
  // The carcass is solid below the drawer line, open above it (sides and
  // back only) so the undermount bowl has room under the countertop.
  var openH = inch(7);
  g.add(box(W, bodyH - openH, bodyD, mat.wood, 0, kickH + (bodyH - openH) / 2, bodyD / 2));
  [-1, 1].forEach(function (sgn) {
    g.add(box(inch(0.75), openH, bodyD, mat.wood, (sgn * (W - inch(0.75))) / 2, H - topT - openH / 2, bodyD / 2));
  });
  g.add(box(W, openH, inch(0.75), mat.wood, 0, H - topT - openH / 2, inch(0.375)));
  var drawerH = inch(6);
  var doorH = bodyH - drawerH - inch(1.5);
  var frontZ = bodyD;
  g.add(shakerFront(W - inch(1), drawerH, mat.wood, 0, H - topT - inch(0.5) - drawerH / 2, frontZ));
  g.add(barPull(mat, 6, false, 0, H - topT - inch(0.5) - drawerH / 2, frontZ + inch(0.75)));
  var doorW = (W - inch(1.5)) / 2;
  [-1, 1].forEach(function (sgn) {
    var x = (sgn * (doorW + inch(0.5))) / 2;
    g.add(shakerFront(doorW, doorH, mat.wood, x, kickH + inch(0.5) + doorH / 2, frontZ));
    g.add(barPull(mat, 4, true, x - sgn * (doorW / 2 - inch(1.5)), kickH + doorH - inch(3), frontZ + inch(0.75)));
  });
  var bowlZ = D / 2 + inch(0.5);
  var top = roundedRectPath(new THREE.Shape(), W, D, inch(0.4));
  top.holes.push(ellipsePath(new THREE.Path(), inch(8), inch(6), bowlZ - D / 2));
  g.add(new THREE.Mesh(planSlabGeometry(top, H - topT, H, D / 2), mat.quartz));
  g.add(box(W, inch(4), inch(0.75), mat.quartz, 0, H + inch(2), inch(0.375)));
  var bowl = new THREE.Mesh(sinkBowlGeometry(inch(8), inch(6), inch(6)), mat.porcelainInside);
  bowl.position.set(0, H - topT, bowlZ);
  g.add(bowl);
  g.add(faucet(mat, H, inch(2.5)));
  return g;
}

// Pedestal sink: a porcelain basin top with rounded front corners and an
// oval bowl, on a waisted pedestal, with a gooseneck faucet.
function buildSink(geo, mat) {
  var r = realSize("Sink_Quantity");
  var W = inch(r.width);
  var D = inch(r.depth);
  var H = inch(r.height);
  var g = new THREE.Group();
  var topT = inch(5);
  var top = roundedRectPath(new THREE.Shape(), W, D, inch(4));
  var bowlZ = D / 2 + inch(1);
  top.holes.push(ellipsePath(new THREE.Path(), inch(7.5), inch(5.5), bowlZ - D / 2));
  g.add(new THREE.Mesh(planSlabGeometry(top, H - topT, H, D / 2), mat.porcelainGloss));
  var bowl = new THREE.Mesh(sinkBowlGeometry(inch(7.5), inch(5.5), inch(4.5)), mat.porcelainInside);
  bowl.position.set(0, H, bowlZ);
  g.add(bowl);
  var pedestal = latheProfileGeometry(
    [
      [0, 0],
      [inch(5), 0],
      [inch(4.6), inch(1.5)],
      [inch(3.2), inch(8)],
      [inch(3), inch(18)],
      [inch(3.8), inch(26)],
      [inch(5.5), H - topT],
      [0, H - topT],
    ],
    0.8,
    32,
  );
  g.add(mesh(pedestal, mat.porcelainGloss, 0, 0, inch(8)));
  g.add(faucet(mat, H, inch(2.5)));
  return g;
}

// Freestanding linen cabinet: a tall wood carcass on a toe kick, with a
// crown cap and two shaker doors with knobs.
function buildCabinet(geo, mat) {
  var r = realSize("Cabinet_Quantity");
  var W = inch(r.width);
  var D = inch(r.depth);
  var H = inch(r.height);
  var kickH = inch(3.5);
  var capH = inch(1.5);
  var g = new THREE.Group();
  g.add(box(W - inch(1), kickH, D - inch(3), mat.woodDark, 0, kickH / 2, (D - inch(3)) / 2));
  var bodyH = H - kickH - capH;
  g.add(box(W, bodyH, D - inch(0.75), mat.wood, 0, kickH + bodyH / 2, (D - inch(0.75)) / 2));
  g.add(box(W + inch(1), capH, D + inch(0.25), mat.wood, 0, H - capH / 2, (D + inch(0.25)) / 2 - inch(0.5)));
  var frontZ = D - inch(0.75);
  var lowerH = inch(28);
  var upperH = bodyH - lowerH - inch(1.5);
  g.add(shakerFront(W - inch(1), lowerH, mat.wood, 0, kickH + inch(0.5) + lowerH / 2, frontZ));
  g.add(shakerFront(W - inch(1), upperH, mat.wood, 0, kickH + inch(1) + lowerH + upperH / 2, frontZ));
  [kickH + lowerH - inch(3), kickH + lowerH + inch(4)].forEach(function (y) {
    g.add(mesh(new THREE.SphereGeometry(inch(0.6), 12, 8), mat.chrome, W / 2 - inch(2.5), y, frontZ + inch(1.2)));
  });
  return g;
}

// 30 x 80in interior door, closed, in the wall: a painted two-panel shaker
// slab with casing trim, three hinges and a lever handle.
function buildEntryDoor(geo, mat) {
  var r = realSize("Door_Quantity");
  var W = inch(r.width);
  var H = inch(r.height);
  var T = inch(1.375);
  var g = new THREE.Group();
  g.add(box(W, H, T, mat.paintedWhite, 0, H / 2, 0));
  var faceZ = T / 2;
  var lowerH = H * 0.55;
  g.add(shakerFront(W - inch(0.5), lowerH, mat.paintedWhite, 0, lowerH / 2 + inch(0.25), faceZ));
  g.add(shakerFront(W - inch(0.5), H - lowerH - inch(0.5), mat.paintedWhite, 0, lowerH + (H - lowerH) / 2, faceZ));
  var casingW = inch(3.5);
  var casingT = inch(0.75);
  [-1, 1].forEach(function (sgn) {
    g.add(box(casingW, H + casingW, casingT, mat.paintedWhite, sgn * (W / 2 + casingW / 2), (H + casingW) / 2, faceZ));
  });
  g.add(box(W + 2 * casingW, casingW, casingT, mat.paintedWhite, 0, H + casingW / 2, faceZ));
  var latchX = W / 2 - inch(2.75);
  var rose = mesh(
    new THREE.CylinderGeometry(inch(1.25), inch(1.25), inch(0.4), 20),
    mat.chrome,
    latchX,
    inch(36),
    faceZ + inch(1),
  );
  rose.rotation.x = Math.PI / 2;
  g.add(rose);
  var lever = mesh(
    new THREE.CapsuleGeometry(inch(0.35), inch(4), 4, 8),
    mat.chrome,
    latchX - inch(2.2),
    inch(36),
    faceZ + inch(1.9),
  );
  lever.rotation.z = Math.PI / 2;
  g.add(lever);
  [inch(7), H / 2, H - inch(11)].forEach(function (y) {
    g.add(box(inch(0.6), inch(3.5), inch(0.6), mat.chrome, -W / 2 + inch(0.1), y, faceZ));
  });
  return g;
}

// Mirrors reflect the room environment (a polished metal surface under
// image-based lighting): the vanity mirror has a slim brushed-metal frame,
// the oversized one is frameless on four chrome clips.
function buildMirror(geo, mat, huge) {
  var r = realSize(huge ? "Mirror_Huge_Quantity" : "Mirror_Quantity");
  var W = inch(r.width);
  var H = inch(r.height);
  var g = new THREE.Group();
  g.add(box(W, H, inch(0.25), mat.mirror, 0, 0, inch(0.4)));
  if (huge) {
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sy) {
        g.add(box(inch(1.2), inch(0.8), inch(0.7), mat.chrome, (sx * (W - inch(6))) / 2, sy * (H / 2), inch(0.45)));
      });
    });
  } else {
    var f = inch(1);
    var t = inch(0.9);
    g.add(box(W + 2 * f, f, t, mat.brushedMetal, 0, H / 2 + f / 2, t / 2));
    g.add(box(W + 2 * f, f, t, mat.brushedMetal, 0, -H / 2 - f / 2, t / 2));
    g.add(box(f, H, t, mat.brushedMetal, -W / 2 - f / 2, 0, t / 2));
    g.add(box(f, H, t, mat.brushedMetal, W / 2 + f / 2, 0, t / 2));
  }
  return g;
}

// Built-in niche on the shower's back wall: a recessed-looking dark tile
// back, stone surround and a stone shelf across the middle.
function buildShowerShelf(geo, mat) {
  var r = realSize("Shower_Shelf_Quantity");
  var W = inch(r.width);
  var H = inch(r.height);
  var z0 = inch(0.55);
  var trim = inch(1.25);
  var g = new THREE.Group();
  g.add(box(W, H, inch(0.1), mat.nicheBack, 0, 0, z0));
  g.add(box(W + 2 * trim, trim, inch(0.6), mat.stone, 0, H / 2 + trim / 2, z0 + inch(0.3)));
  g.add(box(W + 2 * trim, trim, inch(3.5), mat.stone, 0, -H / 2 - trim / 2, z0 + inch(1.75)));
  g.add(box(trim, H, inch(0.6), mat.stone, -W / 2 - trim / 2, 0, z0 + inch(0.3)));
  g.add(box(trim, H, inch(0.6), mat.stone, W / 2 + trim / 2, 0, z0 + inch(0.3)));
  g.add(box(W, inch(0.75), inch(3.5), mat.stone, 0, 0, z0 + inch(1.75)));
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

function rebuildShell(s, widthFt, lengthFt, heightFt) {
  disposeShellGeometries(s);

  var floorGeo = new THREE.PlaneGeometry(widthFt, lengthFt);
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
    var wallGeo = new THREE.PlaneGeometry(w.spanFt, heightFt);
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
  s.shellMaterials.floor.color.setHex(Layout.colorForFloorFinish(state.scope.floorFinish, isDark));
  s.shellMaterials.floor.roughness = roughnessForFloorFinish(state.scope.floorFinish);
  s.shellMaterials.wall.color.setHex(Layout.colorForWalls(state.scope.walls, isDark));
  s.shellMaterials.wall.roughness = roughnessForWalls(state.scope.walls);
  s.shellMaterials.ceiling.color.setHex(Layout.colorForCeiling(state.scope.paintCeiling, isDark));
  s.shellMaterials.ceiling.roughness = roughnessForCeiling(state.scope.paintCeiling);
}

function setShadowFlags(object3d) {
  object3d.traverse(function (child) {
    if (child.isMesh) {
      // Clear glass would otherwise throw a solid shadow.
      child.castShadow = !child.material.transparent;
      child.receiveShadow = true;
    }
  });
}

function rebuildFixtures(s, widthFt, lengthFt) {
  while (s.fixtureGroup.children.length) {
    s.fixtureGroup.remove(s.fixtureGroup.children[0]);
  }
  var layout = Layout.computeLayout({
    widthFt: widthFt,
    lengthFt: lengthFt,
    fixtureCounts: state.fixtures,
    showSamples: true,
    plumbingWallIds: state.plumbingWallIds,
    entryPoints: state.entryPoints,
  });
  s.lastEntryPlacements = layout.placements.filter(function (p) {
    return p.fixtureKey === "Door_Quantity";
  });
  var toiletCount = 0;
  layout.placements.forEach(function (p) {
    // An entry point without a door renders as an open archway — no slab or
    // knob, just the wall opening the placement already reserved.
    if (p.fixtureKey === "Door_Quantity" && p.hasDoor === false) return;
    var template =
      p.fixtureKey === "Toilet_Quantity"
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
      var eyeHeight = 5.5;
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
  var distances = orbitDistances(s, dims);
  s.controls.minDistance = distances.min;
  s.controls.maxDistance = distances.max;
  s.controls.target.copy(target);
  startCameraLerp(s, target, distances.fit);
  s.controls.update();
  needsRender = true;
  syncCameraControls(s);
}

// Orbit distances for a room: min/max zoom, and the distance at which the
// whole floor plan fits the panel along whichever of its width or height is
// the tighter field of view (slightly under a full fit, since the near
// walls cut away anyway).
function orbitDistances(s, dims) {
  var diag = Math.sqrt(dims.widthFt * dims.widthFt + dims.lengthFt * dims.lengthFt);
  var vHalf = THREE.MathUtils.degToRad(s.camera.fov / 2);
  var hHalf = Math.atan(Math.tan(vHalf) * s.camera.aspect);
  var min = clamp(diag * 0.5, 3, 20);
  var max = clamp(diag * 3, 12, 160);
  var fit = clamp((diag / 2 / Math.sin(Math.min(vHalf, hHalf))) * 0.75, min, max);
  return { diag: diag, min: min, max: max, fit: fit };
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
    var distances = orbitDistances(s, dims);
    var diag = distances.diag;
    s.controls.minDistance = distances.min;
    s.controls.maxDistance = distances.max;

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
      var viewDir = new THREE.Vector3(dims.widthFt * 1.3, dims.heightFt * 1.1, dims.lengthFt * 1.6)
        .sub(target)
        .normalize();
      s.camera.position.copy(target).addScaledVector(viewDir, distances.fit);
      s.controls.target.copy(target);
    } else {
      var jump = target.distanceTo(s.controls.target) + Math.abs(diag - (s.lastDiag || diag));
      s.controls.target.copy(target);
      // A resized room is re-framed so all of it is in view again.
      if (jump > 0.75) startCameraLerp(s, target, distances.fit);
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
