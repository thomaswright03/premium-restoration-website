// 3D bathroom room preview: an orbitable, stylized (not photorealistic)
// room built purely from the customer's entered width/length/height (or a
// sensible default before those are asked — see js/bathroom-room-layout.js
// computeRoomDimensions), populated with primitive fixture stand-ins that
// update live as the chat estimate's scope/dimension/fixture fields are
// answered. Self-hosted Three.js (js/vendor/three/), no build step.
//
// This module is the only first-party file using ES module import/export
// (see eslint.config.js) — everything else on the page is a classic
// <script>. window.BathroomRoom3D is always a safe object to call: a
// WebGL failure (unsupported/disabled) is caught inside ensureScene() and
// never propagates into js/script.js's event handlers.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
  // The toilet reads as real vitreous china rather than the stylized
  // brand-toned stand-ins: glossy white with a soft chrome for its trim.
  var toiletPorcelain = new THREE.MeshStandardMaterial({
    color: isDark ? 0xdedbd5 : 0xf7f6f3,
    roughness: 0.28,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  var toiletSeat = new THREE.MeshStandardMaterial({ color: isDark ? 0xe6e3dd : 0xfdfcfa, roughness: 0.45 });
  var toiletWater = new THREE.MeshStandardMaterial({
    color: 0x9fc7d6,
    roughness: 0.1,
    transparent: true,
    opacity: 0.75,
  });
  var chrome = new THREE.MeshStandardMaterial({ color: 0xd6dadf, metalness: 0.55, roughness: 0.22 });
  return {
    porcelain: porcelain,
    cabinetWood: cabinetWood,
    doorTone: doorTone,
    glass: glass,
    brass: brass,
    toiletPorcelain: toiletPorcelain,
    toiletSeat: toiletSeat,
    toiletWater: toiletWater,
    chrome: chrome,
  };
}

function buildGeometries() {
  return Object.assign(toiletGeometries(), {
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
  });
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

// A standard two-piece elongated toilet at real size, built from
// Layout.TOILET (inches, converted to feet here). Local origin sits on the
// wall at floor level (z=0, y=0); the fixture projects forward into the
// room as z increases — the tank near the wall, the bowl further out,
// matching every other floor fixture builder in this file.
function buildToilet(geo, mat) {
  var T = Layout.TOILET;
  var ft = function (inches) {
    return inches / 12;
  };
  var g = new THREE.Group();

  // Bowl: one lathe profile (pedestal flaring up to the rim, then back down
  // the inside of the basin), stretched front-to-back into an elongated
  // oval. Its center sits so the bowl's front edge lands at depthIn.
  var bowlCenterZ = ft(T.depthIn - T.bowlLengthIn / 2);
  var bowl = new THREE.Mesh(geo.toiletBowl, mat.toiletPorcelain);
  bowl.scale.set(1, 1, T.bowlLengthIn / T.bowlWidthIn);
  bowl.position.set(0, 0, bowlCenterZ);

  var water = new THREE.Mesh(geo.toiletWater, mat.toiletWater);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1, T.bowlLengthIn / T.bowlWidthIn, 1);
  water.position.set(0, ft(9), bowlCenterZ);

  // Back of the bowl (the deck the seat hinges on) bridging to the tank.
  var deck = new THREE.Mesh(geo.toiletDeck, mat.toiletPorcelain);
  deck.position.set(0, ft(T.rimHeightIn - 1.5), ft(T.tankDepthIn + 3.5));

  // Seat ring and raised lid, leaning back against the tank.
  var seat = new THREE.Mesh(geo.toiletSeat, mat.toiletSeat);
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, ft(T.rimHeightIn), bowlCenterZ + ft(0.5));
  var lid = new THREE.Mesh(geo.toiletLid, mat.toiletSeat);
  lid.rotation.x = -0.12;
  lid.position.set(0, ft(T.seatHeightIn + T.bowlLengthIn / 2), ft(T.depthIn - T.bowlLengthIn + 0.5));

  // Tank and lid, 1 in off the finished wall.
  var tankHeightIn = T.tankTopIn - 1 - T.rimHeightIn;
  var tank = new THREE.Mesh(geo.toiletTank, mat.toiletPorcelain);
  tank.position.set(0, ft(T.rimHeightIn + tankHeightIn / 2), ft(1 + T.tankDepthIn / 2));
  var tankLid = new THREE.Mesh(geo.toiletTankLid, mat.toiletPorcelain);
  tankLid.position.set(0, ft(T.tankTopIn - 0.5), ft(1 + T.tankDepthIn / 2));

  // Chrome trip lever on the front-left of the tank.
  var handle = new THREE.Mesh(geo.toiletHandle, mat.chrome);
  handle.position.set(ft(-T.tankWidthIn / 2 + 3), ft(T.tankTopIn - 4), ft(1 + T.tankDepthIn + 0.3));

  // Supply stop and line coming out of the wall on the left.
  var stop = new THREE.Mesh(geo.toiletSupplyStop, mat.chrome);
  stop.rotation.x = Math.PI / 2;
  stop.position.set(ft(-6), ft(7), ft(1));
  var line = new THREE.Mesh(geo.toiletSupplyLine, mat.chrome);
  line.position.set(ft(-6), ft(7 + (T.rimHeightIn - 7) / 2 + 0.5), ft(2));

  // Floor bolt caps either side of the drain (roughInIn from the wall).
  var boltL = new THREE.Mesh(geo.toiletBoltCap, mat.toiletPorcelain);
  boltL.position.set(ft(-4.5), 0, ft(T.roughInIn));
  var boltR = boltL.clone();
  boltR.position.set(ft(4.5), 0, ft(T.roughInIn));

  g.add(bowl, water, deck, seat, lid, tank, tankLid, handle, stop, line, boltL, boltR);
  return g;
}

function toiletGeometries() {
  var T = Layout.TOILET;
  var ft = function (inches) {
    return inches / 12;
  };
  var r = ft(T.bowlWidthIn / 2);
  var rim = ft(T.rimHeightIn);
  // [radius, height] pairs, outside going up, then inside going down.
  var profile = [
    [0, 0],
    [ft(4.8), 0],
    [ft(5), ft(0.6)],
    [ft(4.6), ft(3)],
    [ft(4.4), ft(5.5)],
    [ft(5.2), ft(8.5)],
    [r - ft(0.9), ft(12)],
    [r, rim - ft(1)],
    [r, rim],
    [r - ft(1.3), rim],
    [r - ft(1.6), rim - ft(1.5)],
    [ft(4.8), ft(11)],
    [ft(3.6), ft(9)],
    [ft(2.2), ft(7.5)],
    [0, ft(7)],
  ].map(function (pt) {
    return new THREE.Vector2(pt[0], pt[1]);
  });

  var seatOuter = new THREE.Shape();
  seatOuter.absellipse(0, 0, r + ft(0.3), ft(T.bowlLengthIn / 2 + 0.3), 0, Math.PI * 2, false, 0);
  var seatHole = new THREE.Path();
  seatHole.absellipse(0, -ft(0.6), r - ft(2.3), ft(T.bowlLengthIn / 2 - 3), 0, Math.PI * 2, true, 0);
  seatOuter.holes.push(seatHole);
  var lidShape = new THREE.Shape();
  lidShape.absellipse(0, 0, r + ft(0.2), ft(T.bowlLengthIn / 2 + 0.2), 0, Math.PI * 2, false, 0);

  var tankHeightIn = T.tankTopIn - 1 - T.rimHeightIn;
  return {
    toiletBowl: new THREE.LatheGeometry(profile, 40),
    toiletWater: new THREE.CircleGeometry(ft(3.5), 32),
    toiletDeck: new THREE.BoxGeometry(ft(10), ft(3), ft(7)),
    toiletSeat: new THREE.ExtrudeGeometry(seatOuter, { depth: ft(1), bevelEnabled: false, curveSegments: 32 }),
    toiletLid: new THREE.ExtrudeGeometry(lidShape, {
      depth: ft(0.8),
      bevelEnabled: true,
      bevelSize: ft(0.3),
      bevelThickness: ft(0.3),
      bevelSegments: 2,
      curveSegments: 32,
    }),
    toiletTank: new THREE.BoxGeometry(ft(T.tankWidthIn - 1), ft(tankHeightIn), ft(T.tankDepthIn)),
    toiletTankLid: new THREE.BoxGeometry(ft(T.tankWidthIn), ft(1), ft(T.tankDepthIn + 1)),
    toiletHandle: new THREE.BoxGeometry(ft(3), ft(0.5), ft(0.6)),
    toiletSupplyStop: new THREE.CylinderGeometry(ft(0.6), ft(0.6), ft(2), 12),
    toiletSupplyLine: new THREE.CylinderGeometry(ft(0.2), ft(0.2), ft(T.rimHeightIn - 7), 8),
    toiletBoltCap: new THREE.SphereGeometry(ft(0.9), 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  };
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

function buildFixtureTemplates(geo, mat) {
  return {
    Toilet_Quantity: buildToilet(geo, mat),
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
var state = { scope: {}, dims: { widthFt: null, lengthFt: null, heightFt: null }, fixtures: {} };
var dirty = true;
var threeState = null; // null = not tried yet, false = tried and failed, object = live scene

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
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    var scene = new THREE.Scene();
    var skyHex = isDark ? 0x211d17 : 0xfaf8f4;
    var groundHex = isDark ? 0x14120f : 0xf3efe7;
    scene.background = new THREE.Color(skyHex);

    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

    var hemi = new THREE.HemisphereLight(skyHex, groundHex, 2.5);
    var dir = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(hemi, dir);

    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.45;

    var geo = buildGeometries();
    var mat = buildMaterials(isDark);
    var fixtureTemplates = buildFixtureTemplates(geo, mat);
    var fixtureGroup = new THREE.Group();
    scene.add(fixtureGroup);

    var shellMaterials = {
      floor: new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
      wall: new THREE.MeshLambertMaterial({ side: THREE.BackSide }),
      ceiling: new THREE.MeshLambertMaterial({ side: THREE.BackSide }),
    };
    var shellGroup = new THREE.Group();
    scene.add(shellGroup);

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
      fixtureGroup: fixtureGroup,
      shellMaterials: shellMaterials,
      shellGroup: shellGroup,
      shellGeometries: [],
      lastDims: null,
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
  s.shellGroup.add(floor);
  s.shellGeometries.push(floorGeo);

  var ceilingGeo = new THREE.PlaneGeometry(widthFt, lengthFt);
  var ceiling = new THREE.Mesh(ceilingGeo, s.shellMaterials.ceiling);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set(widthFt / 2, heightFt, lengthFt / 2);
  s.shellGroup.add(ceiling);
  s.shellGeometries.push(ceilingGeo);

  shellWalls(widthFt, lengthFt).forEach(function (w) {
    var wallGeo = new THREE.PlaneGeometry(w.spanFt, heightFt);
    var wall = new THREE.Mesh(wallGeo, s.shellMaterials.wall);
    wall.rotation.y = w.rotY;
    wall.position.set(w.x, heightFt / 2, w.z);
    s.shellGroup.add(wall);
    s.shellGeometries.push(wallGeo);
  });
}

function rebuildFinishes(s) {
  var isDark = s.isDark;
  s.shellMaterials.floor.color.setHex(Layout.colorForFloorFinish(state.scope.floorFinish, isDark));
  s.shellMaterials.wall.color.setHex(Layout.colorForWalls(state.scope.walls, isDark));
  s.shellMaterials.ceiling.color.setHex(Layout.colorForCeiling(state.scope.paintCeiling, isDark));
}

function rebuildFixtures(s, widthFt, lengthFt) {
  while (s.fixtureGroup.children.length) {
    s.fixtureGroup.remove(s.fixtureGroup.children[0]);
  }
  var layout = Layout.computeLayout({ widthFt: widthFt, lengthFt: lengthFt, fixtureCounts: state.fixtures });
  layout.placements.forEach(function (p) {
    var template = s.fixtureTemplates[p.fixtureKey];
    if (!template) return;
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
    s.fixtureGroup.add(instance);
  });
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

// How far back the camera sits so the whole floor plan fits the panel,
// whichever of its (often tall and narrow) width or height is the tighter
// field of view. Slightly under a full fit: the near walls cut away anyway.
function framingDistance(s, diag) {
  var vHalf = THREE.MathUtils.degToRad(s.camera.fov / 2);
  var hHalf = Math.atan(Math.tan(vHalf) * s.camera.aspect);
  return (diag / 2 / Math.sin(Math.min(vHalf, hHalf))) * 0.7;
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
    var maxDistance = clamp(diag * 3, 12, 160);
    s.controls.minDistance = minDistance;
    s.controls.maxDistance = maxDistance;

    var fitDistance = clamp(framingDistance(s, diag), minDistance, maxDistance);
    if (!s.lastDims) {
      // First build: place the camera directly, no lerp needed.
      var viewDir = new THREE.Vector3(dims.widthFt * 1.3, dims.heightFt * 1.1, dims.lengthFt * 1.6)
        .sub(target)
        .normalize();
      s.camera.position.copy(target).addScaledVector(viewDir, fitDistance);
      s.controls.target.copy(target);
    } else {
      var jump = target.distanceTo(s.controls.target) + Math.abs(diag - (s.lastDiag || diag));
      s.controls.target.copy(target);
      if (jump > 0.75) {
        startCameraLerp(s, target, fitDistance);
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
    var s = ensureScene();
    if (!s) return;
    if (!s.running) {
      s.running = true;
      s.renderer.setAnimationLoop(function tick() {
        if (dirty) {
          rebuild();
          dirty = false;
        }
        applyCameraLerp(s);
        s.controls.update();
        s.renderer.render(s.scene, s.camera);
      });
    }
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
    state = { scope: {}, dims: { widthFt: null, lengthFt: null, heightFt: null }, fixtures: {} };
    if (threeState) threeState.lastDims = null;
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
