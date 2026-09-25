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
    showerDoorPanel: new THREE.PlaneGeometry(2.5, 6.5),
    showerDoorFrameEdge: new THREE.BoxGeometry(0.06, 6.5, 0.06),
    doorSlab: new THREE.BoxGeometry(2.5, 6.75, 0.15),
    doorKnob: new THREE.SphereGeometry(0.05, 8, 8),
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
  top.scale.set(width / 0.06, 1, 1);
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
  g.add(back, left, right, pan);
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
};
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
      lastDims: null,
      dirLight: dir,
      toiletStyleSwitch: toiletStyleSwitch,
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

  shellWalls(widthFt, lengthFt).forEach(function (w) {
    var wallGeo = new THREE.PlaneGeometry(w.spanFt, heightFt);
    var wall = new THREE.Mesh(wallGeo, s.shellMaterials.wall);
    wall.rotation.y = w.rotY;
    wall.position.set(w.x, heightFt / 2, w.z);
    wall.receiveShadow = true;
    s.shellGroup.add(wall);
    s.shellGeometries.push(wallGeo);
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
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function rebuildFixtures(s, widthFt, lengthFt) {
  while (s.fixtureGroup.children.length) {
    s.fixtureGroup.remove(s.fixtureGroup.children[0]);
  }
  var layout = Layout.computeLayout({ widthFt: widthFt, lengthFt: lengthFt, fixtureCounts: state.fixtures });
  var toiletCount = 0;
  layout.placements.forEach(function (p) {
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
    };
    if (threeState) {
      threeState.lastDims = null;
      if (threeState.toiletStyleSwitch) {
        Array.prototype.forEach.call(threeState.toiletStyleSwitch.children, function (btn, i) {
          var isDefault = i === 0;
          btn.classList.toggle("selected", isDefault);
          btn.setAttribute("aria-pressed", isDefault ? "true" : "false");
        });
      }
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
};
