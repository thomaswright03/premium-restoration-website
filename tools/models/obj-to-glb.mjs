// Converts a manufacturer/catalog fixture .obj into a small .glb the 3D
// bathroom preview (js/bathroom-room-3d.js) loads in place of its
// procedural stand-in, normalized to that file's fixture convention:
//   - units: feet (source OBJs from product indexes are usually inches)
//   - Y up; the fixture's back sits on the wall at z = 0 and it projects
//     into the room toward +z; centered on x; resting on the floor (y = 0)
// Only geometry is kept (positions, normals, triangle indices). These
// OBJs ship without usable materials/textures, so the preview assigns its
// own glazed-porcelain material at load time.
//
// Manual/offline, same "generate once, commit the result" pattern as the
// materials catalog. No dependencies.
//
//   node tools/models/obj-to-glb.mjs in.obj out.glb [--up z|y|-y|x]
//        [--front -y|+y|-z|+z|-x|+x] [--units in|cm|mm|ft] [--mount floor|wall]
//        [--wall-height <in>] [--cluster <in>] [--crease <deg>]
//
// --up     which source axis points up (3ds Max exports are usually z)
// --front  which source direction the fixture's front faces
// --mount  wall: keep the source height instead of dropping it to the
//          floor, and lift it so its top sits at --wall-height inches
//          (a wall-hung sink's rim is typically ~34 in.)
// --cluster  simplification grid size in inches (default 0.35; 0 = off)
// --crease   edges sharper than this many degrees stay hard (default 40)

import { readFileSync, writeFileSync } from "node:fs";

function parseArgs(argv) {
  const opts = { up: "z", front: "-y", units: "in", mount: "floor", wallHeight: 34, cluster: 0.35, crease: 40 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--up") opts.up = argv[++i];
    else if (a === "--front") opts.front = argv[++i];
    else if (a === "--units") opts.units = argv[++i];
    else if (a === "--mount") opts.mount = argv[++i];
    else if (a === "--wall-height") opts.wallHeight = Number(argv[++i]);
    else if (a === "--cluster") opts.cluster = Number(argv[++i]);
    else if (a === "--crease") opts.crease = Number(argv[++i]);
    else pos.push(a);
  }
  if (pos.length !== 2) {
    console.error("usage: node tools/models/obj-to-glb.mjs in.obj out.glb [--up z] [--front -y] [--units in]");
    process.exit(1);
  }
  return { input: pos[0], output: pos[1], opts };
}

const UNIT_TO_FT = { in: 1 / 12, cm: 1 / 30.48, mm: 1 / 304.8, ft: 1 };

// Signed source axis ("-y", "+z", "x") -> [axisIndex, sign]
function axis(spec) {
  const m = /^([+-]?)([xyz])$/.exec(spec);
  if (!m) throw new Error("bad axis: " + spec);
  return ["xyz".indexOf(m[2]), m[1] === "-" ? -1 : 1];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Rotation (as three row basis vectors in source space) mapping source ->
// target, where target Y = up and target +Z = front.
function basis(upSpec, frontSpec) {
  const [ui, us] = axis(upSpec);
  const [fi, fs] = axis(frontSpec);
  if (ui === fi) throw new Error("--up and --front must be different axes");
  const up = [0, 0, 0];
  up[ui] = us;
  const front = [0, 0, 0];
  front[fi] = fs;
  const right = cross(up, front); // target X = Y cross Z
  return [right, up, front];
}

function parseObj(text) {
  const positions = [];
  const normals = [];
  const faces = []; // [[v, vn], ...] per polygon, 0-based
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("v ")) positions.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith("vn ")) normals.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith("f ")) {
      const poly = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((tok) => {
          const [v, , n] = tok.split("/");
          const vi = Number(v);
          const ni = n ? Number(n) : 0;
          return [vi < 0 ? positions.length + vi : vi - 1, ni ? (ni < 0 ? normals.length + ni : ni - 1) : -1];
        });
      faces.push(poly);
    }
  }
  return { positions, normals, faces };
}

function convert(text, opts) {
  const { positions, faces } = parseObj(text);
  const B = basis(opts.up, opts.front);
  const scale = UNIT_TO_FT[opts.units];
  if (!scale) throw new Error("bad --units " + opts.units);
  const rot = (p) => [0, 1, 2].map((r) => B[r][0] * p[0] + B[r][1] * p[1] + B[r][2] * p[2]);

  const P = positions.map((p) => rot(p).map((c) => c * scale));

  // Triangulate (fan) into position-index triangles.
  let tris = [];
  for (const poly of faces) {
    for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0][0], poly[i][0], poly[i + 1][0]]);
  }

  // Vertex-clustering simplification: snap vertices to a grid of
  // --cluster inches, merge each cell to its members' average, drop the
  // triangles that collapse. Catalog models are often far denser than a
  // room preview needs (tens of thousands of triangles per fixture), and
  // every triangle is drawn twice per frame (color + shadow pass).
  let V = P;
  if (opts.cluster > 0) {
    const cell = opts.cluster * scale;
    const cellOf = new Map();
    const sums = [];
    const remap = P.map((p) => {
      const k = p.map((c) => Math.round(c / cell)).join(",");
      let id = cellOf.get(k);
      if (id === undefined) {
        id = sums.length;
        cellOf.set(k, id);
        sums.push([0, 0, 0, 0]);
      }
      const acc = sums[id];
      acc[0] += p[0];
      acc[1] += p[1];
      acc[2] += p[2];
      acc[3]++;
      return id;
    });
    V = sums.map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
    const seen = new Set();
    tris = tris
      .map((t) => t.map((v) => remap[v]))
      .filter((t) => {
        if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) return false;
        const k = [...t].sort((a, b) => a - b).join(",");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  // Normals: smooth across edges gentler than --crease degrees, hard
  // across sharper ones (a tub's rim edge stays crisp, its curves smooth).
  // Source normals are ignored — they don't survive simplification.
  const faceN = tris.map(([a, b, c]) =>
    cross(
      [V[b][0] - V[a][0], V[b][1] - V[a][1], V[b][2] - V[a][2]],
      [V[c][0] - V[a][0], V[c][1] - V[a][1], V[c][2] - V[a][2]],
    ),
  );
  const faceU = faceN.map((n) => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  });
  const incident = V.map(() => []);
  tris.forEach((t, f) => t.forEach((v) => incident[v].push(f)));
  const cosCrease = Math.cos((opts.crease * Math.PI) / 180);

  const outPos = [];
  const outNrm = [];
  const indices = [];
  const key = new Map();
  tris.forEach((t, f) => {
    for (const v of t) {
      const n = [0, 0, 0];
      for (const g of incident[v]) {
        const u = faceU[g];
        if (u[0] * faceU[f][0] + u[1] * faceU[f][1] + u[2] * faceU[f][2] >= cosCrease) {
          n[0] += faceN[g][0];
          n[1] += faceN[g][1];
          n[2] += faceN[g][2];
        }
      }
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      const nn = [n[0] / l, n[1] / l, n[2] / l];
      const k = v + "/" + nn.map((c) => Math.round(c * 100)).join(",");
      let idx = key.get(k);
      if (idx === undefined) {
        idx = outPos.length / 3;
        key.set(k, idx);
        outPos.push(...V[v]);
        outNrm.push(...nn);
      }
      indices.push(idx);
    }
  });

  // Normalize placement: centered on x, back face on z = 0, floor at y = 0
  // (or, wall-mounted, top at --wall-height).
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < outPos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], outPos[i + k]);
      max[k] = Math.max(max[k], outPos[i + k]);
    }
  }
  const dx = -(min[0] + max[0]) / 2;
  const dy = opts.mount === "wall" ? opts.wallHeight / 12 - max[1] : -min[1];
  const dz = -min[2];
  for (let i = 0; i < outPos.length; i += 3) {
    outPos[i] += dx;
    outPos[i + 1] += dy;
    outPos[i + 2] += dz;
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { positions: new Float32Array(outPos), normals: new Float32Array(outNrm), indices, size, dy };
}

function writeGlb({ positions, normals, indices }, name) {
  const vertexCount = positions.length / 3;
  const index = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const pad4 = (n) => (n + 3) & ~3;
  const posBytes = positions.byteLength;
  const nrmBytes = normals.byteLength;
  const idxBytes = index.byteLength;
  const binLength = pad4(posBytes) + pad4(nrmBytes) + pad4(idxBytes);
  const bin = Buffer.alloc(binLength);
  Buffer.from(positions.buffer).copy(bin, 0);
  Buffer.from(normals.buffer).copy(bin, pad4(posBytes));
  Buffer.from(index.buffer).copy(bin, pad4(posBytes) + pad4(nrmBytes));

  const pmin = [Infinity, Infinity, Infinity];
  const pmax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      pmin[k] = Math.min(pmin[k], positions[i + k]);
      pmax[k] = Math.max(pmax[k], positions[i + k]);
    }
  }
  const gltf = {
    asset: { version: "2.0", generator: "premium-restoration tools/models/obj-to-glb.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: pad4(posBytes), byteLength: nrmBytes, target: 34962 },
      { buffer: 0, byteOffset: pad4(posBytes) + pad4(nrmBytes), byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: "VEC3", min: pmin, max: pmax },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: "VEC3" },
      { bufferView: 2, componentType: index instanceof Uint32Array ? 5125 : 5123, count: index.length, type: "SCALAR" },
    ],
  };
  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  json = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, bin)]);
}

const { input, output, opts } = parseArgs(process.argv.slice(2));
const result = convert(readFileSync(input, "utf8"), opts);
const name = output.replace(/^.*\//, "").replace(/\.glb$/, "");
const glb = writeGlb(result, name);
writeFileSync(output, glb);
const ft = result.size.map((s) => s.toFixed(2));
const inches = result.size.map((s) => (s * 12).toFixed(1));
console.log(
  `${output}: ${result.positions.length / 3} vertices, ${result.indices.length / 3} triangles, ` +
    `${(glb.length / 1024).toFixed(0)} KB — ${ft[0]} x ${ft[1]} x ${ft[2]} ft (W x H x D) = ${inches.join(" x ")} in.`,
);
