#!/usr/bin/env python3
"""
Convert an Apple LiDAR/Object Capture .usdz scan into a .glb Three.js can
load, for the "real per-product 3D scan" path explored for the 3D bathroom
preview.

STATUS: manual/offline tool, run by hand against one scan at a time. Nothing
in the live site calls this. Three.js has no native USD/USDZ loader, so this
exists to bridge that gap: Apple's capture apps (Polycam, Scaniverse,
RealityScan, iOS's own Object Capture) export .usdz; the site needs
.glb/.gltf.

WHAT IT DOES: .usdz is a ZIP container around a binary USD scene (.usdc) plus
its texture image(s). This reads the mesh (points, triangle indices, UVs) and
the diffuse texture out of the .usdc with Pixar's own USD Python bindings,
writes an intermediate OBJ+MTL+JPG (a format trimesh can read back cleanly
with its texture intact), then re-exports that as a single-file .glb.

WHY TWO HOPS INSTEAD OF USD -> GLB DIRECTLY: pxr (Pixar's USD toolkit) can
read USD but doesn't export glTF; trimesh can export glTF but can't read USD.
OBJ+MTL+JPG is the simple, lossless middle format both tools agree on for a
single textured mesh. This only handles ONE mesh prim with ONE material/
texture and no skeleton/animation — that covers a static furniture/fixture
scan, which is all this project needs.

REQUIRES: pip install usd-core trimesh "numpy<2" pillow
  (numpy<2 specifically: trimesh 4.0.5's GLTF exporter still calls the
  ndarray.ptp() method numpy 2.0 removed — pin below 2.0 or the .glb export
  raises AttributeError: 'numpy.ndarray' object has no attribute 'ptp'.)

USAGE:
  python3 usdz_to_glb.py path/to/scan.usdz [output.glb]

KNOWN LIMITATION — scan quality, not this script: this only converts what's
in the .usdz faithfully. It does not clean up, crop, or denoise anything. A
raw scene/room-mode LiDAR capture (as opposed to a dedicated single-object
"Object" capture mode) can come out as thousands of disconnected mesh
fragments covering a room-sized area rather than one clean fixture-sized
surface — this script will convert that faithfully too, producing a .glb
that's just as unusable as the .usdz was. If the rendered result looks like
noise, the fix is rescanning with the capture app's dedicated object-capture
mode (isolate the object, move slowly, go all the way around it), not this
script. See the "3D scan-to-web pipeline" note in the main README for the
fuller writeup of what a usable capture requires.
"""

import sys
import zipfile
from pathlib import Path

from pxr import Usd, UsdGeom


def usdz_to_obj(usdz_path, work_dir):
    stage = Usd.Stage.Open(str(usdz_path))
    mesh_prims = [p for p in stage.Traverse() if p.GetTypeName() == "Mesh"]
    if not mesh_prims:
        raise ValueError(f"No Mesh prim found in {usdz_path}")
    if len(mesh_prims) > 1:
        print(
            f"  Warning: {len(mesh_prims)} Mesh prims found, using the first "
            f"({mesh_prims[0].GetPath()}) — others are ignored."
        )

    mesh = UsdGeom.Mesh(mesh_prims[0])
    points = mesh.GetPointsAttr().Get()
    face_indices = mesh.GetFaceVertexIndicesAttr().Get()
    face_counts = mesh.GetFaceVertexCountsAttr().Get()
    if any(c != 3 for c in face_counts):
        raise ValueError("Non-triangulated mesh — this tool only handles triangle meshes")

    primvars = UsdGeom.PrimvarsAPI(mesh.GetPrim())
    st = primvars.GetPrimvar("st")
    has_uv = st and st.HasValue()
    if has_uv:
        st_values = st.Get()
        st_indices = st.GetIndices() if st.IsIndexed() else face_indices

    obj_path = work_dir / "scan.obj"
    mtl_path = work_dir / "scan.mtl"
    texture_path = work_dir / "scan_texture.jpg"

    with open(obj_path, "w") as f:
        f.write("mtllib scan.mtl\nusemtl scanmat\n")
        for p in points:
            f.write(f"v {p[0]} {p[1]} {p[2]}\n")
        if has_uv:
            for uv in st_values:
                f.write(f"vt {uv[0]} {1.0 - uv[1]}\n")
        ntris = len(face_indices) // 3
        for i in range(ntris):
            b = i * 3
            a1, a2, a3 = face_indices[b] + 1, face_indices[b + 1] + 1, face_indices[b + 2] + 1
            if has_uv:
                t1, t2, t3 = st_indices[b] + 1, st_indices[b + 1] + 1, st_indices[b + 2] + 1
                f.write(f"f {a1}/{t1} {a2}/{t2} {a3}/{t3}\n")
            else:
                f.write(f"f {a1} {a2} {a3}\n")

    with open(mtl_path, "w") as f:
        f.write("newmtl scanmat\n")
        if has_uv:
            f.write("map_Kd scan_texture.jpg\n")

    if has_uv:
        with zipfile.ZipFile(usdz_path) as z:
            image_names = [n for n in z.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png"))]
            if image_names:
                with z.open(image_names[0]) as src, open(texture_path, "wb") as dst:
                    dst.write(src.read())
            else:
                print("  Warning: mesh has UVs but no texture image found in the .usdz")

    print(f"  {len(points)} vertices, {ntris} triangles, UVs: {has_uv}")
    return obj_path


def obj_to_glb(obj_path, glb_path):
    import numpy as np

    if not hasattr(np.ndarray, "ptp"):
        raise RuntimeError(
            "numpy>=2 detected — trimesh's GLTF exporter needs numpy<2 for this "
            "version of trimesh. `pip install \"numpy<2\"` and retry."
        )

    import trimesh

    mesh = trimesh.load(str(obj_path), process=False)
    mesh.export(str(glb_path))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    usdz_path = Path(sys.argv[1])
    if not usdz_path.exists():
        print(f"No such file: {usdz_path}")
        sys.exit(1)

    glb_path = Path(sys.argv[2]) if len(sys.argv) > 2 else usdz_path.with_suffix(".glb")

    print(f"Reading {usdz_path} ...")
    obj_path = usdz_to_obj(usdz_path, usdz_path.parent)

    print(f"Exporting {glb_path} ...")
    obj_to_glb(obj_path, glb_path)

    size_mb = glb_path.stat().st_size / 1_000_000
    print(f"Done: {glb_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
