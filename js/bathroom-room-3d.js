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
  return { porcelain: porcelain, cabinetWood: cabinetWood, doorTone: doorTone, glass: glass, brass: brass };
}

function buildGeometries() {
  return {
    toiletBowl: new THREE.CylinderGeometry(0.5, 0.55, 0.9, 16),
    toiletTank: new THREE.BoxGeometry(0.55, 0.65, 0.3),
    toiletSeat: new THREE.TorusGeometry(0.42, 0.06, 8, 24),
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

function buildToilet(geo, mat) {
  // Local origin sits on the wall (z=0); the fixture projects forward into
  // the room as z increases — the tank sits near the wall, the bowl further
  // out, matching every other floor fixture builder in this file.
  var g = new THREE.Group();
  var tank = new THREE.Mesh(geo.toiletTank, mat.porcelain);
  tank.position.set(0, 0.75, 0.15);
  var bowl = new THREE.Mesh(geo.toiletBowl, mat.porcelain);
  bowl.position.set(0, 0.45, 0.6);
  var seat = new THREE.Mesh(geo.toiletSeat, mat.porcelain);
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(1, 1, 0.5);
  seat.position.set(0, 0.92, 0.6);
  g.add(bowl, tank, seat);
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
