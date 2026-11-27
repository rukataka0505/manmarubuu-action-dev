"""Complete Blender 5.2 procedural DIY diorama & clockwork arena kit generator.

Generates 32 beveled, UV-mapped, unified-material GLB assets under public/models/diorama/
matching art-bible 07 (Nintendo field), 08 (Diorama blocks/domino/rug), and 09 (Boss arena),
plus renders 2 EEVEE visual QA contact sheets for human/agent inspection before game integration.
"""
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

GAME_ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web")
OUT_DIR = GAME_ROOT / "public" / "models" / "diorama"
PBR_DIR = GAME_ROOT / "public" / "textures" / "pbr"
HERO_GLB = GAME_ROOT / "public" / "models" / "manmarubuu_animated.glb"
BOSS_GLB = GAME_ROOT / "public" / "models" / "ai" / "boss_king.glb"
CUSHION_GLB = GAME_ROOT / "public" / "models" / "ai" / "cushion.glb"
TMP_QA = GAME_ROOT / "blender" / "_tmp_diorama_qa"

OUT_DIR.mkdir(parents=True, exist_ok=True)
TMP_QA.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    return scene


def count_tris():
    total = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            total += len(me.loop_triangles)
            ev.to_mesh_clear()
    return total


def export_glb(path: Path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_tangents=False,
        export_image_format="AUTO",
    )


def load_packed_image(path: Path, non_color=False):
    if not path.exists():
        return None
    img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


def make_mat(
    name: str,
    color=(1.0, 1.0, 1.0),
    metallic=0.0,
    roughness=0.5,
    coat=0.0,
    coat_rough=0.1,
    alpha=1.0,
    emission=None,
    emission_strength=0.0,
    normal_img=None,
    normal_strength=0.35,
):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if alpha < 1.0 and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else mat.blend_method
    if normal_img is not None:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = normal_img
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if emission is not None and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def make_contract_materials():
    oak_nor = load_packed_image(PBR_DIR / "oak_veneer_01" / "nor_gl.jpg", non_color=True)
    walnut_nor = load_packed_image(PBR_DIR / "dark_wooden_planks" / "nor_gl.jpg", non_color=True)
    metal_nor = load_packed_image(PBR_DIR / "metal_plate_02" / "nor_gl.jpg", non_color=True)
    fleece_nor = load_packed_image(PBR_DIR / "polar_fleece" / "nor_gl.jpg", non_color=True)
    knit_nor = load_packed_image(PBR_DIR / "knitted_fleece" / "nor_gl.jpg", non_color=True)

    return {
        "honey_oak": make_mat("MAT_HoneyOak", (0.58, 0.36, 0.16), roughness=0.46, normal_img=oak_nor, normal_strength=0.42),
        "dark_walnut": make_mat("MAT_DarkWalnut", (0.20, 0.11, 0.06), roughness=0.42, normal_img=walnut_nor, normal_strength=0.50),
        "red": make_mat("MAT_WoodRed", (0.88, 0.22, 0.24), roughness=0.44, normal_img=oak_nor, normal_strength=0.28),
        "blue": make_mat("MAT_WoodBlue", (0.18, 0.46, 0.88), roughness=0.44, normal_img=oak_nor, normal_strength=0.28),
        "yellow": make_mat("MAT_WoodYellow", (0.95, 0.72, 0.16), roughness=0.44, normal_img=oak_nor, normal_strength=0.28),
        "mint": make_mat("MAT_WoodMint", (0.32, 0.78, 0.60), roughness=0.44, normal_img=oak_nor, normal_strength=0.28),
        "pink": make_mat("MAT_WoodPink", (0.94, 0.48, 0.64), roughness=0.44, normal_img=oak_nor, normal_strength=0.28),
        "green": make_mat("MAT_WoodGreen", (0.24, 0.68, 0.30), roughness=0.44, normal_img=oak_nor, normal_strength=0.28),
        "cream": make_mat("MAT_WoodCream", (0.92, 0.87, 0.78), roughness=0.46, normal_img=oak_nor, normal_strength=0.22),
        "brass": make_mat("MAT_BrassGold", (0.86, 0.64, 0.22), metallic=0.88, roughness=0.24, normal_img=metal_nor, normal_strength=0.32),
        "chrome": make_mat("MAT_ChromeSpring", (0.80, 0.84, 0.90), metallic=0.94, roughness=0.16),
        "red_bumper": make_mat("MAT_RedBumper", (0.86, 0.12, 0.18), roughness=0.24, coat=0.72),
        "mat_dark": make_mat("MAT_MatDark", (0.14, 0.16, 0.21), roughness=0.84),
        "stitch": make_mat("MAT_CreamStitch", (0.96, 0.91, 0.80), roughness=0.78),
        "knit_rug": make_mat("MAT_KnitRug", (0.85, 0.64, 0.64), roughness=0.92, normal_img=knit_nor, normal_strength=0.55),
        "felt_moss": make_mat("MAT_FeltMoss", (0.34, 0.56, 0.18), roughness=0.92, normal_img=fleece_nor, normal_strength=0.55),
        "lantern": make_mat("MAT_LanternGlow", (1.0, 0.88, 0.55), roughness=0.2, emission=(1.0, 0.64, 0.18), emission_strength=3.0),
        "glass": make_mat("MAT_ArenaGlass", (0.82, 0.91, 1.0), roughness=0.06, coat=1.0, alpha=0.30),
        "daisy_white": make_mat("MAT_DaisyWhite", (0.97, 0.97, 0.94), roughness=0.55),
        "daisy_center": make_mat("MAT_DaisyCenter", (0.98, 0.72, 0.10), roughness=0.48),
        "daisy_stem": make_mat("MAT_DaisyStem", (0.28, 0.64, 0.22), roughness=0.68),
        "pin_white": make_mat("MAT_PinWhite", (0.97, 0.94, 0.88), roughness=0.22, coat=0.65),
        "pin_red": make_mat("MAT_PinRed", (0.90, 0.16, 0.20), roughness=0.24, coat=0.60),
    }


def apply_box_uv(bm, uv_scale=0.55):
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            c = loop.vert.co
            if ax >= ay and ax >= az:
                u, v = c.y * uv_scale, c.z * uv_scale
            elif ay >= ax and ay >= az:
                u, v = c.x * uv_scale, c.z * uv_scale
            else:
                u, v = c.x * uv_scale, c.y * uv_scale
            loop[uv_layer].uv = (u, v)


def apply_cube_face_uv(bm, span=1.15):
    """Map every cube face to [0,1]x[0,1] using signed outward-normal tangent axes (glTF + flipY=false upright)."""
    uv_layer = bm.loops.layers.uv.verify()
    half = span * 0.5
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            c = loop.vert.co
            if ay >= ax and ay >= az:
                if n.y < 0.0:
                    # Blender -Y (Three.js +Z front): left=-X, right=+X, up=+Z
                    u = (c.x + half) / span
                    v = (c.z + half) / span
                else:
                    # Blender +Y (Three.js -Z back): left=+X, right=-X, up=+Z
                    u = (-c.x + half) / span
                    v = (c.z + half) / span
            elif ax >= ay and ax >= az:
                if n.x > 0.0:
                    # Blender +X (Three.js +X right): left=-Y, right=+Y, up=+Z
                    u = (c.y + half) / span
                    v = (c.z + half) / span
                else:
                    # Blender -X (Three.js -X left): left=+Y, right=-Y, up=+Z
                    u = (-c.y + half) / span
                    v = (c.z + half) / span
            else:
                if n.z > 0.0:
                    # Blender +Z (Three.js +Y top): left=-X, right=+X, up=+Y
                    u = (c.x + half) / span
                    v = (c.y + half) / span
                else:
                    # Blender -Z (Three.js -Y bottom): left=-X, right=+X, up=-Y
                    u = (c.x + half) / span
                    v = (-c.y + half) / span
            loop[uv_layer].uv = (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))


def finalize_mesh_obj(name, bm, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), uv_scale=0.55, weighted=True, smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if uv_scale is not None:
        apply_box_uv(bm, uv_scale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if smooth and ob.data.polygons:
        ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    if weighted:
        mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        mod.weight = 100
        mod.mode = "FACE_AREA_WITH_ANGLE"
    if parent:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def new_empty(name, parent=None, loc=(0, 0, 0)):
    em = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(em)
    if parent:
        em.parent = parent
    em.location = loc
    return em


def new_box(name, size, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.04, segs=2, uv_scale=0.55, weighted=True):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    max_bev = min(size[0], size[1], size[2]) * 0.38
    bev = min(bevel, max_bev)
    if bev > 0.001:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bev, segments=segs, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, rot, uv_scale=uv_scale, weighted=weighted)


def new_cyl(name, r1, r2, depth, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), segs=28, bevel=0.03, uv_scale=0.55, weighted=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    if bevel > 0.001:
        rim = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.002]
        if rim:
            bmesh.ops.bevel(bm, geom=rim, offset=min(bevel, depth * 0.35), segments=2, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, rot, uv_scale=uv_scale, weighted=weighted)


def new_cone(name, r1, r2, height, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), segs=28, bevel=0.025):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=height)
    if bevel > 0.001:
        bottom_rim = [e for e in bm.edges if e.verts[0].co.z < 0 and e.verts[1].co.z < 0]
        if bottom_rim:
            bmesh.ops.bevel(bm, geom=bottom_rim, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, rot, weighted=True)


def new_sphere(name, r, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=24, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    return finalize_mesh_obj(name, bm, mat, parent, loc, rot, weighted=False)


def new_torus(name, R, r, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), maj=36, min_s=14):
    bm = bmesh.new()
    rings = []
    for i in range(maj):
        u = 2 * math.pi * i / maj
        cu, su = math.cos(u), math.sin(u)
        ring = []
        for j in range(min_s):
            v = 2 * math.pi * j / min_s
            cv, sv = math.cos(v), math.sin(v)
            rr = R + r * cv
            ring.append(bm.verts.new((rr * cu, rr * su, r * sv)))
        rings.append(ring)
    for i in range(maj):
        ni = (i + 1) % maj
        for j in range(min_s):
            nj = (j + 1) % min_s
            bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))
    return finalize_mesh_obj(name, bm, mat, parent, loc, rot, weighted=False)


def new_coil(name, radius, tube_r, height, turns, mat, parent=None, loc=(0, 0, 0), path_steps=84, circ_steps=12):
    bm = bmesh.new()
    rings = []
    for i in range(path_steps + 1):
        t = i / path_steps
        a = t * math.pi * 2.0 * turns
        cx, cy, cz = math.cos(a) * radius, math.sin(a) * radius, t * height
        tang = Vector((-math.sin(a) * radius, math.cos(a) * radius, height / (2.0 * math.pi * turns))).normalized()
        up = Vector((0, 0, 1))
        nrm = tang.cross(up).normalized()
        binrm = tang.cross(nrm).normalized()
        ring = []
        for j in range(circ_steps):
            v = 2 * math.pi * j / circ_steps
            pt = Vector((cx, cy, cz)) + nrm * (math.cos(v) * tube_r) + binrm * (math.sin(v) * tube_r)
            ring.append(bm.verts.new(pt))
        rings.append(ring)
    for i in range(path_steps):
        for j in range(circ_steps):
            nj = (j + 1) % circ_steps
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][nj], rings[i][nj]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    return finalize_mesh_obj(name, bm, mat, parent, loc, weighted=False)


def new_ring_sector(name, r_in, r_out, height, a0, a1, segs, mat, parent=None, loc=(0, 0, 0), bevel=0.03):
    bm = bmesh.new()
    top_in, top_out, bot_in, bot_out = [], [], [], []
    hz = height * 0.5
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * (i / segs)
        ca, sa = math.cos(a), math.sin(a)
        top_in.append(bm.verts.new((ca * r_in, sa * r_in, hz)))
        top_out.append(bm.verts.new((ca * r_out, sa * r_out, hz)))
        bot_in.append(bm.verts.new((ca * r_in, sa * r_in, -hz)))
        bot_out.append(bm.verts.new((ca * r_out, sa * r_out, -hz)))
    for i in range(segs):
        bm.faces.new((top_in[i], top_out[i], top_out[i + 1], top_in[i + 1]))
        bm.faces.new((bot_out[i], bot_in[i], bot_in[i + 1], bot_out[i + 1]))
        bm.faces.new((top_out[i], bot_out[i], bot_out[i + 1], top_out[i + 1]))
        bm.faces.new((bot_in[i], top_in[i], top_in[i + 1], bot_in[i + 1]))
    bm.faces.new((bot_in[0], bot_out[0], top_out[0], top_in[0]))
    bm.faces.new((top_in[-1], top_out[-1], bot_out[-1], bot_in[-1]))
    if bevel > 0.001:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, height * 0.35), segments=2, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, weighted=True)


def new_full_annulus(name, r_in, r_out, height, segs, mat, parent=None, loc=(0, 0, 0), bevel=0.03):
    bm = bmesh.new()
    top_in, top_out, bot_in, bot_out = [], [], [], []
    hz = height * 0.5
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ca, sa = math.cos(a), math.sin(a)
        top_in.append(bm.verts.new((ca * r_in, sa * r_in, hz)))
        top_out.append(bm.verts.new((ca * r_out, sa * r_out, hz)))
        bot_in.append(bm.verts.new((ca * r_in, sa * r_in, -hz)))
        bot_out.append(bm.verts.new((ca * r_out, sa * r_out, -hz)))
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((top_in[i], top_out[i], top_out[ni], top_in[ni]))
        bm.faces.new((bot_out[i], bot_in[i], bot_in[ni], bot_out[ni]))
        bm.faces.new((top_out[i], bot_out[i], bot_out[ni], top_out[ni]))
        bm.faces.new((bot_in[i], top_in[i], top_in[ni], bot_in[ni]))
    if bevel > 0.001:
        rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.002]
        if rims:
            bmesh.ops.bevel(bm, geom=rims, offset=min(bevel, height * 0.32), segments=2, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, weighted=True)


def new_gear_xy(name, radius, thickness, teeth, mat, parent=None, loc=(0, 0, 0), spokes=6):
    """Horizontal cogwheel gear rotating around vertical Z in Blender (= Y in Three.js)."""
    bm = bmesh.new()
    segs = teeth * 4
    ir, mr, orad = radius * 0.72, radius * 0.87, radius
    tz, bz = thickness * 0.5, -thickness * 0.5
    to, bo, ti, bi = [], [], [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        r = orad if (i % 4 in (1, 2)) else mr
        ca, sa = math.cos(a), math.sin(a)
        to.append(bm.verts.new((ca * r, sa * r, tz)))
        bo.append(bm.verts.new((ca * r, sa * r, bz)))
        ti.append(bm.verts.new((ca * ir, sa * ir, tz)))
        bi.append(bm.verts.new((ca * ir, sa * ir, bz)))
    for i in range(segs):
        ni = (i + 1) % segs
        bm.faces.new((ti[i], to[i], to[ni], ti[ni]))
        bm.faces.new((bo[i], bi[i], bi[ni], bo[ni]))
        bm.faces.new((to[i], bo[i], bo[ni], to[ni]))
        bm.faces.new((bi[i], ti[i], ti[ni], bi[ni]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(0.03, thickness * 0.16), segments=1, affect="EDGES", clamp_overlap=True)
    rim = finalize_mesh_obj(name, bm, mat, parent, loc, weighted=True)

    # Central hub + radiating spokes
    new_cyl(f"{name}_Hub", radius * 0.24, radius * 0.24, thickness * 1.18, mat, rim, segs=24, bevel=0.03)
    for k in range(spokes):
        ang = 2 * math.pi * k / spokes
        new_box(
            f"{name}_Spoke_{k}",
            (radius * 1.48 if spokes % 2 == 0 and k < spokes // 2 else radius * 0.74, radius * 0.11, thickness * 0.68),
            mat,
            rim,
            loc=(0 if (spokes % 2 == 0 and k < spokes // 2) else math.cos(ang) * radius * 0.42, 0 if (spokes % 2 == 0 and k < spokes // 2) else math.sin(ang) * radius * 0.42, 0),
            rot=(0, 0, ang),
            bevel=0.02,
        )
    return rim


def new_star_prism(name, outer_r, inner_r, pts, height, mat, parent=None, loc=(0, 0, 0)):
    bm = bmesh.new()
    top_v, bot_v = [], []
    hz = height * 0.5
    tc = bm.verts.new((0, 0, hz))
    bc = bm.verts.new((0, 0, -hz))
    for i in range(pts * 2):
        a = math.pi * i / pts
        r = outer_r if i % 2 == 0 else inner_r
        top_v.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, hz)))
        bot_v.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, -hz)))
    n = pts * 2
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((tc, top_v[i], top_v[ni]))
        bm.faces.new((bc, bot_v[ni], bot_v[i]))
        bm.faces.new((top_v[i], bot_v[i], bot_v[ni], top_v[ni]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(0.025, height * 0.22), segments=1, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, weighted=True)


def save_asset(filename: str, build_fn):
    clear_scene()
    mats = make_contract_materials()
    build_fn(mats)
    out = OUT_DIR / f"{filename}.glb"
    export_glb(out)
    print(f"BUILT {out.name}: tris={count_tris()}")


def new_arch_block(name, span_x, depth_y, height_z, arch_r, mat, parent=None, loc=(0, 0, 0), segs=24, bevel=0.045):
    """Wooden toy arch bridge block with carved semicircular underside passage."""
    bm = bmesh.new()
    hy = depth_y * 0.5
    hx = span_x * 0.5
    front_v, back_v = [], []
    # Trace outer rectangle + inner semicircular arch cut
    pts = []
    # Bottom-left -> arch start -> semicircular arc -> arch end -> bottom-right -> top-right -> top-left
    pts.append((-hx, 0.0))
    for i in range(segs + 1):
        a = math.pi * (1.0 - i / segs)
        pts.append((math.cos(a) * arch_r, math.sin(a) * arch_r))
    pts.append((hx, 0.0))
    pts.append((hx, height_z))
    pts.append((-hx, height_z))

    # Build arch cleanly as quads radially from center (0, height_z) so concave faces never fail
    bm_top_l = bm.verts.new((-hx, -hy, height_z))
    bm_top_r = bm.verts.new((hx, -hy, height_z))
    bm_bot_l = bm.verts.new((-hx, -hy, 0.0))
    bm_bot_r = bm.verts.new((hx, -hy, 0.0))
    b_top_l = bm.verts.new((-hx, hy, height_z))
    b_top_r = bm.verts.new((hx, hy, height_z))
    b_bot_l = bm.verts.new((-hx, hy, 0.0))
    b_bot_r = bm.verts.new((hx, hy, 0.0))

    f_arc, b_arc = [], []
    for i in range(segs + 1):
        a = math.pi * (1.0 - i / segs)
        ax, az = math.cos(a) * arch_r, math.sin(a) * arch_r
        f_arc.append(bm.verts.new((ax, -hy, az)))
        b_arc.append(bm.verts.new((ax, hy, az)))

    # Connect arc vertices to top perimeter corners (left quadrant -> top, right quadrant -> top)
    # Use upper rim vertices interpolated along perimeter so every face is a clean convex quad!
    f_rim, b_rim = [], []
    for i in range(segs + 1):
        t = i / segs
        if t < 0.25:
            u = t / 0.25
            rx, rz = -hx, height_z * u
        elif t <= 0.75:
            u = (t - 0.25) / 0.5
            rx, rz = -hx + span_x * u, height_z
        else:
            u = (t - 0.75) / 0.25
            rx, rz = hx, height_z * (1.0 - u)
        f_rim.append(bm.verts.new((rx, -hy, rz)))
        b_rim.append(bm.verts.new((rx, hy, rz)))

    for i in range(segs):
        bm.faces.new((f_arc[i], f_arc[i + 1], f_rim[i + 1], f_rim[i]))
        bm.faces.new((b_rim[i], b_rim[i + 1], b_arc[i + 1], b_arc[i]))
        bm.faces.new((f_arc[i], b_arc[i], b_arc[i + 1], f_arc[i + 1]))
        bm.faces.new((f_rim[i], f_rim[i + 1], b_rim[i + 1], b_rim[i]))

    # Left & right bottom pillars connecting to arch ends
    bm.faces.new((bm_bot_l, f_arc[0], f_rim[0]))
    bm.faces.new((b_rim[0], b_arc[0], b_bot_l))
    bm.faces.new((bm_bot_l, b_bot_l, b_arc[0], f_arc[0]))
    bm.faces.new((bm_bot_l, f_rim[0], b_rim[0], b_bot_l))

    bm.faces.new((f_arc[-1], bm_bot_r, f_rim[-1]))
    bm.faces.new((b_rim[-1], b_bot_r, b_arc[-1]))
    bm.faces.new((f_arc[-1], b_arc[-1], b_bot_r, bm_bot_r))
    bm.faces.new((f_rim[-1], bm_bot_r, b_bot_r, b_rim[-1]))

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.001:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    return finalize_mesh_obj(name, bm, mat, parent, loc, weighted=True)


# ==============================================================================
# 1. CASTLE & TOYBOX ARCHITECTURE (Art Bible 07 x 08)
# ==============================================================================
def build_castle_arch_gate(m):
    root = new_empty("CastleArchGate")
    # Carved semicircular honey-oak arch block spanning between towers (Z = 2.9 .. 5.8, arch radius 2.25m -> 4.5m wide!)
    new_arch_block("MainArchSpan", 5.8, 2.05, 2.9, 2.15, m["honey_oak"], root, (0, 0, 2.9), bevel=0.05)
    new_box("UpperPastelDeck", (5.8, 2.18, 0.42), m["mint"], root, (0, 0, 6.01), bevel=0.045)
    # Colorful keystone arch trim & stacked pastel toy blocks above the archway (Art Bible 07)
    for idx, (ang_deg, cm) in enumerate(((152, "red"), (126, "yellow"), (90, "pink"), (54, "blue"), (28, "mint"))):
        ang = math.radians(ang_deg)
        kx = math.cos(ang) * 2.38
        kz = 2.9 + math.sin(ang) * 2.38
        new_box(f"ArchKeystone_{idx}", (0.58, 2.18, 0.46), m[cm], root, (kx, 0, kz), rot=(0, math.pi / 2 - ang, 0), bevel=0.045)

    # Flanking cylindrical toy towers (X = +/- 3.55, totally crisp silhouette like Art Bible 07!)
    for idx, (sx, body_m, roof_m, win_m) in enumerate(((-3.55, m["red"], m["yellow"], m["cream"]), (3.55, m["blue"], m["red"], m["cream"]))):
        new_cyl(f"Plinth_{idx}", 1.38, 1.34, 0.48, m["honey_oak"], root, (sx, 0, 0.24), segs=28, bevel=0.05)
        new_cyl(f"TowerCyl_{idx}", 1.15, 1.15, 5.45, body_m, root, (sx, 0, 3.16), segs=28, bevel=0.05)
        new_cyl(f"TowerMidBand_{idx}", 1.24, 1.24, 0.34, m["mint"] if idx == 0 else m["yellow"], root, (sx, 0, 2.25), segs=28, bevel=0.035)
        new_cyl(f"Collar_{idx}", 1.32, 1.32, 0.44, m["honey_oak"], root, (sx, 0, 6.08), segs=28, bevel=0.045)
        new_cyl(f"UpperTurret_{idx}", 0.94, 0.94, 1.25, m["cream"], root, (sx, 0, 6.90), segs=24, bevel=0.04)
        new_cone(f"Roof_{idx}", 1.40, 0.08, 2.40, roof_m, root, (sx, 0, 8.62), segs=28)
        new_sphere(f"Finial_{idx}", 0.20, m["brass"], root, (sx, 0, 9.84))
        new_box(f"WinFrame_{idx}", (0.76, 0.24, 1.05), m["honey_oak"], root, (sx, -1.10, 3.85), bevel=0.04)
        new_box(f"WinGlass_{idx}", (0.48, 0.28, 0.72), win_m, root, (sx, -1.12, 3.85), bevel=0.02)
    # Supporting honey-oak gate piers tucked inside arch ends (keeping >4.2m walkable width)
    for sx in (-2.50, 2.50):
        new_box(f"ArchPier_{sx}", (0.80, 1.95, 2.92), m["honey_oak"], root, (sx, 0, 1.46), bevel=0.05)
    # Outer stacked pastel toy block wings flanking main towers
    for side_idx, (sx, b_col, t_col, r_col) in enumerate(((-5.15, "blue", "yellow", "pink"), (5.15, "mint", "pink", "blue"))):
        new_box(f"WingBase_{side_idx}", (1.35, 1.45, 1.50), m[b_col], root, (sx, 0.15, 0.75), bevel=0.06)
        new_box(f"WingTop_{side_idx}", (1.15, 1.25, 1.25), m[t_col], root, (sx, 0.15, 2.10), bevel=0.05)
        new_cone(f"WingRoof_{side_idx}", 0.88, 0.06, 1.35, m[r_col], root, (sx, 0.15, 3.38), segs=20)

    # Crenellations + central stepped toy castle spire above the arch!
    for i, cx in enumerate((-1.95, -0.65, 0.65, 1.95)):
        cm = m["yellow"] if i % 2 == 0 else m["pink"]
        new_box(f"Merlon_{i}", (0.76, 1.85, 0.72), cm, root, (cx, 0, 6.56), bevel=0.05)
    new_box("CenterTurret", (2.15, 1.95, 1.75), m["yellow"], root, (0, 0, 7.15), bevel=0.06)
    new_box("CenterTurretTrim", (2.32, 2.12, 0.28), m["honey_oak"], root, (0, 0, 7.98), bevel=0.04)
    new_box("CenterWin", (0.78, 2.04, 0.78), m["pink"], root, (0, 0, 7.22), bevel=0.04)
    new_cone("CenterRoof", 1.38, 0.08, 2.15, m["blue"], root, (0, 0, 9.05), segs=24)
    new_sphere("CenterFinial", 0.24, m["brass"], root, (0, 0, 10.12))


def build_castle_tower(roof_color_key="red"):
    def _build(m):
        root = new_empty("CastleTower")
        new_cyl("Base", 1.35, 1.30, 0.55, m["honey_oak"], root, (0, 0, 0.275), segs=28, bevel=0.05)
        new_cyl("Body", 1.15, 1.12, 5.2, m["cream"], root, (0, 0, 3.15), segs=28, bevel=0.04)
        for rz, cm in ((1.8, m["mint"]), (4.5, m["blue"])):
            new_cyl(f"Band_{rz}", 1.22, 1.22, 0.34, cm, root, (0, 0, rz), segs=28, bevel=0.03)
        new_cyl("TopGallery", 1.38, 1.32, 0.72, m["honey_oak"], root, (0, 0, 6.08), segs=28, bevel=0.05)
        for i in range(6):
            a = 2 * math.pi * i / 6
            new_box(f"Tooth_{i}", (0.48, 0.42, 0.55), m["honey_oak"], root, (math.cos(a) * 1.08, math.sin(a) * 1.08, 6.66), rot=(0, 0, a), bevel=0.04)
        new_cone("Roof", 1.46, 0.08, 2.35, m[roof_color_key], root, (0, 0, 7.62), segs=28)
        new_sphere("Finial", 0.22, m["brass"], root, (0, 0, 8.82))
    return _build


def build_castle_keep_center(m):
    root = new_empty("CastleKeepCenter")
    # Tiered beveled honey-oak & pastel toy block fortress supporting summit Star (height 9.0m!)
    new_box("Tier1Base", (6.4, 6.4, 3.2), m["honey_oak"], root, (0, 0, 1.6), bevel=0.08, segs=3)
    new_box("Tier1Trim", (6.65, 6.65, 0.42), m["blue"], root, (0, 0, 3.32), bevel=0.05)
    new_box("Tier2Body", (5.8, 5.8, 3.2), m["cream"], root, (0, 0, 5.10), bevel=0.08, segs=3)
    new_box("Tier2Trim", (6.2, 6.2, 0.48), m["yellow"], root, (0, 0, 6.85), bevel=0.05)
    new_box("Tier3Top", (6.3, 6.3, 1.9), m["honey_oak"], root, (0, 0, 8.05), bevel=0.07, segs=3)
    # Four corner mini turrets + peaked pastel roofs around perimeter (leaving central 4.4x4.4 open for Star!)
    for idx, (cx, cy, cm) in enumerate(((-2.55, -2.55, "red"), (2.55, -2.55, "blue"), (-2.55, 2.55, "yellow"), (2.55, 2.55, "mint"))):
        new_cyl(f"CornerTurret_{idx}", 0.72, 0.72, 1.6, m["honey_oak"], root, (cx, cy, 9.5), segs=20, bevel=0.04)
        new_cone(f"CornerRoof_{idx}", 0.90, 0.06, 1.35, m[cm], root, (cx, cy, 10.90), segs=20)
    # Recessed pastel window frames on all 4 sides
    for idx, (px, py, rz) in enumerate(((0, -2.92, 0), (0, 2.92, math.pi), (-2.92, 0, math.pi / 2), (2.92, 0, -math.pi / 2))):
        new_box(f"KeepWin_{idx}", (1.6, 0.24, 1.5), m["pink"], root, (px, py, 5.1), rot=(0, 0, rz), bevel=0.05)
        new_box(f"KeepPane_{idx}", (1.1, 0.30, 1.05), m["mint"], root, (px, py, 5.1), rot=(0, 0, rz), bevel=0.03)


def build_castle_stairs_wood(m):
    root = new_empty("CastleStairsWood")
    # 5 wide beveled honey-oak steps spanning Y = -1.6 .. +1.6 (in Z in Three.js), climbing Z = 0 .. +1.25
    steps = 5
    total_d = 3.4
    total_h = 1.25
    step_d = total_d / steps
    step_h = total_h / steps
    for i in range(steps):
        h = step_h * (i + 1)
        y = -total_d * 0.5 + step_d * (i + 0.5)
        # Note: -Y in Blender becomes +Z in Three.js (south front), +Y becomes -Z (north toward castle)
        new_box(f"Step_{i}", (4.6, step_d + 0.06, h), m["honey_oak"], root, (0, y, h * 0.5), bevel=0.04, segs=2)
    # Sloped cheek walls flanking steps
    for sx in (-2.42, 2.42):
        new_box(f"Cheek_{sx}", (0.34, total_d, total_h * 0.62), m["honey_oak"], root, (sx, 0, total_h * 0.48), rot=(math.atan2(total_h, total_d), 0, 0), bevel=0.04)
        new_cyl(f"Newel_{sx}", 0.22, 0.24, 1.05, m["honey_oak"], root, (sx, -total_d * 0.5 + 0.22, 0.52), bevel=0.04)
        new_sphere(f"NewelCap_{sx}", 0.23, m["yellow"], root, (sx, -total_d * 0.5 + 0.22, 1.08))


def build_castle_wall_crenel(m):
    root = new_empty("CastleWallCrenel")
    new_box("WallBase", (4.2, 1.0, 1.35), m["honey_oak"], root, (0, 0, 0.675), bevel=0.05, segs=3)
    new_box("MidBand", (4.26, 1.08, 0.24), m["blue"], root, (0, 0, 1.25), bevel=0.03)
    for i, cx in enumerate((-1.5, -0.5, 0.5, 1.5)):
        cm = m["honey_oak"] if i % 2 == 0 else m["red"]
        new_box(f"Merlon_{i}", (0.76, 0.92, 0.58), cm, root, (cx, 0, 1.60), bevel=0.05)


def build_toy_house(roof_key="red"):
    def _build(m):
        root = new_empty("ToyHouse")
        new_box("Plinth", (3.25, 3.05, 0.30), m["honey_oak"], root, (0, 0, 0.15), bevel=0.045)
        new_box("Body", (2.75, 2.55, 1.80), m["cream"], root, (0, 0, 1.20), bevel=0.07, segs=3)
        # Honey-oak corner timber beams & warm mid-trim belt
        for cx in (-1.28, 1.28):
            for cy in (-1.18, 1.18):
                new_box(f"CornerPost_{cx}_{cy}", (0.28, 0.28, 1.82), m["honey_oak"], root, (cx, cy, 1.20), bevel=0.035)
        new_box("EaveBand", (2.92, 2.72, 0.22), m["yellow"] if roof_key == "red" else m["mint"], root, (0, 0, 2.02), bevel=0.04)
        # Beveled pitched roof constructed from two sloped thick wooden slabs + gable blocks
        for side, sgn in (("L", -1), ("R", 1)):
            new_box(f"RoofSlab_{side}", (1.92, 3.05, 0.28), m[roof_key], root, (sgn * 0.76, 0, 2.54), rot=(0, sgn * 0.62, 0), bevel=0.05)
        new_box("RoofGable", (0.58, 3.08, 0.36), m["honey_oak"], root, (0, 0, 3.02), rot=(0, math.pi / 4, 0), bevel=0.045)
        new_box("GableCore", (1.65, 2.40, 0.72), m["cream"], root, (0, 0, 2.38), rot=(0, math.pi / 4, 0), bevel=0.05)
        new_box("Chimney", (0.48, 0.48, 0.98), m["honey_oak"], root, (0.85, 0.55, 2.94), bevel=0.04)
        new_box("ChimneyCap", (0.60, 0.60, 0.14), m["pink"] if roof_key == "blue" else m["blue"], root, (0.85, 0.55, 3.44), bevel=0.03)
        # Front wooden step, arched/framed door, brass knob & upper round gable window
        new_box("PorchStep", (1.30, 0.52, 0.18), m["honey_oak"], root, (0, -1.52, 0.09), bevel=0.03)
        new_box("DoorFrame", (0.98, 0.26, 1.28), m["honey_oak"], root, (0, -1.26, 0.94), bevel=0.04)
        new_box("DoorLeaf", (0.70, 0.30, 1.06), m["mint"] if roof_key == "red" else m["yellow"], root, (0, -1.27, 0.87), bevel=0.03)
        new_cyl("Knob", 0.06, 0.06, 0.08, m["brass"], root, (0.20, -1.41, 0.87), rot=(math.pi / 2, 0, 0), bevel=0.01)
        new_cyl("AtticWinRim", 0.32, 0.32, 0.18, m["honey_oak"], root, (0, -1.22, 2.32), rot=(math.pi / 2, 0, 0), segs=20, bevel=0.025)
        new_cyl("AtticWinGlass", 0.21, 0.21, 0.21, m["blue"], root, (0, -1.23, 2.32), rot=(math.pi / 2, 0, 0), segs=18, bevel=0.01)
        # Side cottage windows with wooden frames & flower window boxes
        for sgn in (-1.0, 1.0):
            new_box(f"SideWinFrame_{sgn}", (0.24, 0.92, 0.84), m["honey_oak"], root, (sgn * 1.36, 0, 1.28), bevel=0.035)
            new_box(f"SideWinPane_{sgn}", (0.28, 0.64, 0.58), m["blue"], root, (sgn * 1.37, 0, 1.28), bevel=0.02)
            new_box(f"SidePlanter_{sgn}", (0.34, 1.02, 0.22), m["pink"] if roof_key == "red" else m["yellow"], root, (sgn * 1.44, 0, 0.78), bevel=0.035)
    return _build


def build_wood_rail_bridge(m):
    """Centered at (0,0,0), 4.0m wide (X), 6.0m long (Y), 0.55m deck thickness — Art Bible 08 central wood ramp bridge."""
    root = new_empty("WoodRailBridge")
    new_box("Deck", (4.0, 6.0, 0.52), m["honey_oak"], root, (0, 0, 0), bevel=0.05, segs=2)
    # Cross plank trim ribs underneath
    for py in (-2.4, -0.8, 0.8, 2.4):
        new_box(f"CrossRib_{py}", (4.16, 0.30, 0.22), m["mint"], root, (0, py, -0.22), bevel=0.03)
    # Twin toy wooden safety rails flanking X = +/-1.86
    for sx in (-1.86, 1.86):
        new_box(f"RailTop_{sx}", (0.24, 6.0, 0.22), m["honey_oak"], root, (sx, 0, 0.86), bevel=0.04)
        for py in (-2.5, 0.0, 2.5):
            new_box(f"Post_{sx}_{py}", (0.24, 0.24, 0.76), m["honey_oak"], root, (sx, py, 0.52), bevel=0.03)


def build_bevel_cube_wood(m):
    new_box("BevelCubeWood", (1.25, 1.25, 1.25), m["honey_oak"], None, (0, 0, 0.625), bevel=0.075, segs=3)


def build_bevel_cylinder_wood(m):
    new_cyl("BevelCylWood", 0.52, 0.52, 2.2, m["honey_oak"], None, (0, 0, 1.1), segs=32, bevel=0.05)


def build_toy_platform_slab(m):
    """1.0x1.0x1.0m unit beveled toy block slab (for scaling without un-beveled raw BoxGeometry)."""
    root = new_empty("ToyPlatformSlab")
    new_box("SlabBody", (0.96, 0.96, 0.84), m["cream"], root, (0, 0, -0.08), bevel=0.06, segs=3)
    new_box("SlabTopDeck", (1.00, 1.00, 0.16), m["honey_oak"], root, (0, 0, 0.42), bevel=0.045, segs=2)
    new_box("SlabBottomRim", (0.99, 0.99, 0.10), m["honey_oak"], root, (0, 0, -0.45), bevel=0.03, segs=2)
    for sx in (-0.42, 0.42):
        for sy in (-0.42, 0.42):
            new_cyl(f"SlabStud_{sx}_{sy}", 0.038, 0.038, 0.03, m["brass"], root, (sx, sy, 0.495), segs=12, bevel=0.008)


def build_checkpoint_flag_felt(m):
    """Turned wooden pole with stitched felt pennant flag ('FlagCloth' node for activation animation)."""
    root = new_empty("CheckpointFlagFelt")
    new_cyl("FlagBase", 0.34, 0.38, 0.14, m["honey_oak"], root, (0, 0, 0.07), segs=24, bevel=0.03)
    new_cyl("FlagCollar", 0.16, 0.19, 0.12, m["brass"], root, (0, 0, 0.16), segs=20, bevel=0.02)
    new_cyl("FlagPole", 0.085, 0.072, 2.66, m["honey_oak"], root, (0, 0, 1.48), segs=18, bevel=0.015)
    new_torus("FlagPoleRing", 0.095, 0.022, m["brass"], root, (0, 0, 2.66))
    new_sphere("FlagFinial", 0.16, m["brass"], root, (0, 0, 2.88))

    # Wavy beveled pennant flag extending +X from pole at Z = 2.34, pivot at (0.06, 0, 2.34)
    bm = bmesh.new()
    nx, nz = 12, 6
    length = 1.18
    half_h0 = 0.36
    hy = 0.024
    front_v, back_v = [], []
    for ix in range(nx + 1):
        u = ix / nx
        x = u * length
        # Taper cleanly to a rounded pennant tip at u=1
        half_h = half_h0 * (1.0 - 0.86 * (u ** 1.15))
        wave_y = math.sin(u * math.pi * 1.65) * 0.055 * u
        col_f, col_b = [], []
        for iz in range(nz + 1):
            v = iz / nz
            z = (v - 0.5) * 2.0 * half_h
            col_f.append(bm.verts.new((x, wave_y - hy, z)))
            col_b.append(bm.verts.new((x, wave_y + hy, z)))
        front_v.append(col_f)
        back_v.append(col_b)
    for ix in range(nx):
        for iz in range(nz):
            bm.faces.new((front_v[ix][iz], front_v[ix + 1][iz], front_v[ix + 1][iz + 1], front_v[ix][iz + 1]))
            bm.faces.new((back_v[ix][iz], back_v[ix][iz + 1], back_v[ix + 1][iz + 1], back_v[ix + 1][iz]))
        bm.faces.new((front_v[ix][0], back_v[ix][0], back_v[ix + 1][0], front_v[ix + 1][0]))
        bm.faces.new((back_v[ix][nz], front_v[ix][nz], front_v[ix + 1][nz], back_v[ix + 1][nz]))
    for iz in range(nz):
        bm.faces.new((back_v[0][iz], front_v[0][iz], front_v[0][iz + 1], back_v[0][iz + 1]))
        bm.faces.new((front_v[nx][iz], back_v[nx][iz], back_v[nx][iz + 1], front_v[nx][iz + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=1, affect="EDGES", clamp_overlap=True)
    flag_obj = finalize_mesh_obj("FlagCloth", bm, m["red"], root, loc=(0.06, 0, 2.34), weighted=True)

    # Cream felt border stitches embedded along upper & lower pennant edges (children of FlagCloth)
    for k in range(6):
        u = 0.12 + k * 0.145
        x = u * length
        half_h = half_h0 * (1.0 - 0.86 * (u ** 1.15)) - 0.045
        wave_y = math.sin(u * math.pi * 1.65) * 0.055 * u
        slope_ang = math.atan2(-0.86 * 1.15 * (u ** 0.15) * half_h0, length)
        new_box(f"FlagStitchTop_{k}", (0.09, 0.06, 0.022), m["stitch"], flag_obj, (x, wave_y, half_h), rot=(0, -slope_ang, 0), bevel=0.006)
        new_box(f"FlagStitchBot_{k}", (0.09, 0.06, 0.022), m["stitch"], flag_obj, (x, wave_y, -half_h), rot=(0, slope_ang, 0), bevel=0.006)


# ==============================================================================
# 2. DYNAMIC TOYS & TRAMPOLINES
# ==============================================================================
def build_alphabet_block_bevel(m):
    root = new_empty("AlphabetBlock")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(1.15, 1.15, 1.15), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.065, segments=3, affect="EDGES", clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    apply_cube_face_uv(bm, 1.15)
    finalize_mesh_obj("BlockBody", bm, m["cream"], root, uv_scale=None, weighted=True)


def build_wood_crate_bevel(m):
    root = new_empty("WoodCrate")
    # Outer beveled wood box + raised perimeter frame rails
    new_box("CoreBox", (1.16, 1.16, 1.16), m["honey_oak"], root, (0, 0, 0), bevel=0.04, segs=2)
    for axis in range(3):
        for s1 in (-0.56, 0.56):
            for s2 in (-0.56, 0.56):
                sz = [0.16, 0.16, 0.16]
                loc = [0.0, 0.0, 0.0]
                sz[axis] = 1.28
                other = [i for i in range(3) if i != axis]
                loc[other[0]] = s1
                loc[other[1]] = s2
                new_box(f"Edge_{axis}_{s1}_{s2}", tuple(sz), m["honey_oak"], root, tuple(loc), bevel=0.03)
    # Cross braces on front/back/left/right
    for px, py, rz in ((0, -0.58, 0), (0, 0.58, 0), (-0.58, 0, math.pi / 2), (0.58, 0, math.pi / 2)):
        new_box(f"Brace_{px}_{py}", (1.12, 0.08, 0.16), m["honey_oak"], root, (px, py, 0), rot=(0, 0.785, rz), bevel=0.02)


def build_wood_domino_bevel(m):
    """Beveled oak toy domino centered at (0,0,0), W=0.88, H=1.85, D=0.26 (Art Bible 08)."""
    root = new_empty("WoodDomino")
    new_box("Body", (0.88, 0.26, 1.85), m["honey_oak"], root, (0, 0, 0), bevel=0.045, segs=3)
    # Center divider band + raised pip dots on both broad faces
    for sy in (-0.125, 0.125):
        new_box(f"Divider_{sy}", (0.72, 0.03, 0.055), m["cream"], root, (0, sy, 0), bevel=0.01)
        for px, pz in ((-0.19, 0.54), (0.19, 0.30), (-0.19, -0.32), (0.0, -0.46), (0.19, -0.60)):
            new_sphere(f"Pip_{sy}_{px}_{pz}", 0.052, m["cream"], root, (px, sy, pz), scale=(1, 0.45, 1), segs=12, rings=8)


def build_bowling_pin_smooth(m):
    """Lathe bowling pin, total height 1.55m centered around Z=0 so Y offset matches collider."""
    root = new_empty("BowlingPin")
    profile = [
        (0.00, -0.775), (0.19, -0.775), (0.24, -0.68), (0.31, -0.46),
        (0.34, -0.22), (0.31, 0.02), (0.21, 0.24), (0.14, 0.40),
        (0.17, 0.54), (0.22, 0.65), (0.18, 0.74), (0.09, 0.775), (0.00, 0.775),
    ]
    bm = bmesh.new()
    segs = 28
    rings = []
    for r, z in profile:
        if r == 0:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            ring = []
            for i in range(segs):
                a = 2 * math.pi * i / segs
                ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
            rings.append(ring)
    for k in range(len(rings) - 1):
        r0, r1 = rings[k], rings[k + 1]
        if len(r0) == 1:
            for i in range(segs):
                ni = (i + 1) % segs
                bm.faces.new((r0[0], r1[i], r1[ni]))
        elif len(r1) == 1:
            for i in range(segs):
                ni = (i + 1) % segs
                bm.faces.new((r0[i], r1[0], r0[ni]))
        else:
            for i in range(segs):
                ni = (i + 1) % segs
                bm.faces.new((r0[i], r1[i], r1[ni], r0[ni]))
    finalize_mesh_obj("PinBody", bm, m["pin_white"], root, weighted=False)
    for sz in (0.34, 0.46):
        new_torus(f"RedStripe_{sz}", 0.165, 0.022, m["pin_red"], root, (0, 0, sz), maj=28, min_s=10)


def build_trampoline_coil(wood_top=False):
    """Spring trampoline with named 'Coil' and 'Cap' children for Three.js bounce stretch animation."""
    def _build(m):
        root = new_empty("Trampoline")
        # Brass socket base ring
        new_cyl("BasePlate", 1.38, 1.48, 0.16, m["cream"], root, (0, 0, 0.08), segs=32, bevel=0.04)
        new_full_annulus("BaseBrass", 1.15, 1.38, 0.18, 32, m["brass"], root, (0, 0, 0.12), bevel=0.03)
        # Open-spaced chrome helical coil (wire radius 0.062, 4.2 turns -> clear gap between turns!)
        new_coil("Coil", 0.78, 0.062, 0.90, 4.2, m["chrome"], root, (0, 0, 0.16), path_steps=110, circ_steps=12)
        # Moving Cap group at Z = 1.16
        cap = new_empty("Cap", root, (0, 0, 1.16))
        if wood_top:
            new_cyl("WoodPad", 1.36, 1.32, 0.28, m["honey_oak"], cap, (0, 0, 0), segs=36, bevel=0.06)
            new_full_annulus("BrassRim", 1.18, 1.38, 0.14, 36, m["brass"], cap, (0, 0, 0.02), bevel=0.025)
            new_cyl("StarInlay", 0.48, 0.50, 0.06, m["yellow"], cap, (0, 0, 0.14), segs=5, bevel=0.02)
        else:
            new_torus("RedBumper", 1.18, 0.19, m["red_bumper"], cap, (0, 0, 0), maj=36, min_s=16)
            new_cyl("CenterMat", 1.14, 1.14, 0.18, m["mat_dark"], cap, (0, 0, -0.02), segs=32, bevel=0.02)
            # Cream dashed stitch dots around bumper top
            for i in range(24):
                a = 2 * math.pi * i / 24
                new_box(f"Stitch_{i}", (0.12, 0.045, 0.03), m["stitch"], cap, (math.cos(a) * 1.14, math.sin(a) * 1.14, 0.175), rot=(0, 0, a + math.pi / 2), bevel=0.01)
            new_star_prism("StarCenter", 0.46, 0.22, 5, 0.06, m["yellow"], cap, (0, 0, 0.08))
    return _build


def build_trampoline_mini_pastel(m):
    root = new_empty("MiniPastelTrampoline")
    # Art Bible 07: Central helical chrome spring + cream base + 4 slim support legs + pink rim
    new_cyl("BasePlate", 0.56, 0.62, 0.08, m["cream"], root, (0, 0, 0.04), segs=24, bevel=0.02)
    new_coil("Coil", 0.38, 0.042, 0.44, 3.6, m["chrome"], root, (0, 0, 0.04), path_steps=84, circ_steps=10)
    for i in range(4):
        a = math.pi / 4 + 2 * math.pi * i / 4
        new_cyl(f"Leg_{i}", 0.038, 0.048, 0.46, m["chrome"], root, (math.cos(a) * 0.92, math.sin(a) * 0.92, 0.23), rot=(math.sin(a) * 0.14, -math.cos(a) * 0.14, 0), segs=12, bevel=0.008)
    cap = new_empty("Cap", root, (0, 0, 0.50))
    new_torus("PinkRim", 1.10, 0.14, m["pink"], cap, (0, 0, 0), maj=36, min_s=14)
    new_cyl("BlackNet", 1.04, 1.04, 0.10, m["mat_dark"], cap, (0, 0, -0.01), segs=32, bevel=0.01)
    for i in range(18):
        a = 2 * math.pi * i / 18
        new_box(f"Stitch_{i}", (0.10, 0.04, 0.025), m["stitch"], cap, (math.cos(a) * 1.06, math.sin(a) * 1.06, 0.13), rot=(0, 0, a + math.pi / 2), bevel=0.008)


# ==============================================================================
# 3. FIELD DIORAMA PROPS (Stepping Stones, Knit Rug, Daisy, Felt Tree, Fence, Star Gate)
# ==============================================================================
def build_stepping_stone_round(m):
    new_cyl("StepStoneRound", 0.86, 0.88, 0.34, m["cream"], None, (0, 0, 0.17), segs=32, bevel=0.09)


def build_stepping_stone_plank(m):
    new_box("StepStonePlank", (2.35, 0.78, 0.30), m["cream"], None, (0, 0, 0.15), bevel=0.075, segs=3)


def build_patchwork_rug(m):
    """Art Bible 08 thick knitted patchwork rug (9.2m x 7.6m, rounded outline + fine blanket yarn stitches)."""
    root = new_empty("PatchworkRug")
    bm = bmesh.new()
    nx, ny = 32, 26
    w, d = 9.2, 7.6
    verts = []
    for iy in range(ny + 1):
        row = []
        vy = iy / ny
        y = (vy - 0.5) * d
        for ix in range(nx + 1):
            vx = ix / nx
            x = (vx - 0.5) * w
            # Gentle rounded corners in XY plane
            dx = max(0.0, abs(x) - (w * 0.5 - 0.7))
            dy = max(0.0, abs(y) - (d * 0.5 - 0.7))
            corner = math.hypot(dx, dy)
            edge_drop = max(0.0, min(1.0, 1.0 - max(0.0, corner - 0.55) / 0.22))
            wave = 0.015 * math.sin(x * 1.4) * math.cos(y * 1.2)
            # Soft quilted puffiness near edges
            z = (0.14 + wave) * (0.35 + 0.65 * math.sin(edge_drop * math.pi * 0.5))
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    uv_layer = bm.loops.layers.uv.verify()
    for iy in range(ny):
        for ix in range(nx):
            f = bm.faces.new((verts[iy][ix], verts[iy][ix + 1], verts[iy + 1][ix + 1], verts[iy + 1][ix]))
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (co.x / w + 0.5, co.y / d + 0.5)
    finalize_mesh_obj("RugBody", bm, m["knit_rug"], root, uv_scale=None, weighted=False)

    # Fine cream yarn blanket stitches hugging the rounded rug contour (exact rounded corner fit)
    hx_in = w * 0.5 - 0.70
    hy_in = d * 0.5 - 0.70
    r_crn = 0.52
    pts_2d = []
    segs_s = 13
    segs_c = 4
    # Bottom edge (-Y)
    for i in range(segs_s):
        pts_2d.append((-hx_in + (2 * hx_in) * (i / segs_s), -(hy_in + r_crn), 0.0))
    # Bottom-Right corner
    for i in range(segs_c):
        a = -math.pi / 2 + (math.pi / 2) * (i / segs_c)
        pts_2d.append((hx_in + math.cos(a) * r_crn, -hy_in + math.sin(a) * r_crn, a + math.pi / 2))
    # Right edge (+X)
    for i in range(segs_s):
        pts_2d.append((hx_in + r_crn, -hy_in + (2 * hy_in) * (i / segs_s), math.pi / 2))
    # Top-Right corner
    for i in range(segs_c):
        a = (math.pi / 2) * (i / segs_c)
        pts_2d.append((hx_in + math.cos(a) * r_crn, hy_in + math.sin(a) * r_crn, a + math.pi / 2))
    # Top edge (+Y)
    for i in range(segs_s):
        pts_2d.append((hx_in - (2 * hx_in) * (i / segs_s), hy_in + r_crn, 0.0))
    # Top-Left corner
    for i in range(segs_c):
        a = math.pi / 2 + (math.pi / 2) * (i / segs_c)
        pts_2d.append((-hx_in + math.cos(a) * r_crn, hy_in + math.sin(a) * r_crn, a + math.pi / 2))
    # Left edge (-X)
    for i in range(segs_s):
        pts_2d.append((-(hx_in + r_crn), hy_in - (2 * hy_in) * (i / segs_s), math.pi / 2))
    # Bottom-Left corner
    for i in range(segs_c):
        a = math.pi + (math.pi / 2) * (i / segs_c)
        pts_2d.append((-hx_in + math.cos(a) * r_crn, -hy_in + math.sin(a) * r_crn, a + math.pi / 2))

    for i, (px, py, rotz) in enumerate(pts_2d):
        new_cyl(f"RugYarn_{i}", 0.016, 0.016, 0.12, m["stitch"], root, (px, py, 0.132), rot=(0, math.pi / 2, rotz), segs=8, bevel=0.007)


def build_daisy_white(m):
    root = new_empty("DaisyWhite")
    new_cyl("Stem", 0.024, 0.018, 0.36, m["daisy_stem"], root, (0, 0, 0.18), segs=10, bevel=0.0)
    for sx, ang in ((-0.09, 0.45), (0.09, -0.45)):
        new_sphere(f"Leaf_{sx}", 0.09, m["daisy_stem"], root, (sx, 0, 0.11), rot=(0, ang, 0), scale=(1.1, 0.5, 0.25), segs=12, rings=8)
    head = new_empty("Head", root, (0, 0, 0.37))
    head.rotation_euler = (-0.25, 0, 0)
    new_sphere("Center", 0.105, m["daisy_center"], head, (0, 0, 0.03), scale=(1, 1, 0.55), segs=16, rings=10)
    for i in range(8):
        a = 2 * math.pi * i / 8
        new_sphere(f"Petal_{i}", 0.105, m["daisy_white"], head, (math.cos(a) * 0.175, math.sin(a) * 0.175, 0.015), rot=(0, 0, a), scale=(1.35, 0.62, 0.26), segs=14, rings=8)


def build_toy_tree_felt(m):
    root = new_empty("ToyTreeFelt")
    new_cyl("Trunk", 0.34, 0.24, 1.9, m["honey_oak"], root, (0, 0, 0.95), segs=18, bevel=0.04)
    for idx, (lx, ly, lz, sc) in enumerate(((0, 0, 2.55, 1.18), (-0.52, 0.22, 2.25, 0.82), (0.50, -0.20, 2.30, 0.85), (0.05, 0.48, 2.15, 0.72), (0, 0, 3.25, 0.78))):
        new_sphere(f"Crown_{idx}", sc, m["felt_moss"], root, (lx, ly, lz), scale=(1.08, 1.08, 0.92), segs=20, rings=14)


def build_toy_fence_wood(m):
    root = new_empty("ToyFence")
    for px in (-1.05, 0.0, 1.05):
        new_cyl(f"Post_{px}", 0.12, 0.10, 0.92, m["honey_oak"], root, (px, 0, 0.46), segs=16, bevel=0.03)
        new_sphere(f"Ball_{px}", 0.125, m["honey_oak"], root, (px, 0, 0.96), scale=(1, 1, 0.78), segs=16, rings=10)
    for rz in (0.32, 0.68):
        new_box(f"Rail_{rz}", (2.36, 0.11, 0.15), m["honey_oak"], root, (0, 0, rz), bevel=0.035)


def build_star_gate_clockwork(m):
    root = new_empty("StarGateClockwork")
    for sx in (-4.6, 4.6):
        new_box(f"Base_{sx}", (2.3, 2.3, 0.65), m["honey_oak"], root, (sx, 0, 0.325), bevel=0.06)
        new_box(f"Pillar_{sx}", (1.75, 1.75, 8.6), m["blue"], root, (sx, 0, 4.9), bevel=0.08, segs=3)
        new_box(f"Collar_{sx}", (2.05, 2.05, 0.55), m["honey_oak"], root, (sx, 0, 8.95), bevel=0.05)
        new_cone(f"PillarRoof_{sx}", 1.55, 0.08, 2.1, m["red"], root, (sx, 0, 10.25), segs=24)
    new_box("ArchBeam", (11.6, 1.9, 1.85), m["honey_oak"], root, (0, 0, 9.85), bevel=0.08, segs=3)
    new_box("ArchTrim", (11.9, 2.1, 0.34), m["cream"], root, (0, 0, 10.82), bevel=0.04)
    # Real toothed brass gear crest behind arch
    gear = new_gear_xy("ArchGear", 4.3, 0.62, 16, m["brass"], root, (0, 0.45, 12.1), spokes=6)
    gear.rotation_euler = (math.pi / 2, 0, 0)
    # 3 golden bezel sockets for the Star Lamps on front face
    for idx, lx in enumerate((-2.5, 0.0, 2.5)):
        new_cyl(f"Socket_{idx}", 0.85, 0.92, 0.35, m["brass"], root, (lx, -0.98, 9.85), rot=(math.pi / 2, 0, 0), segs=24, bevel=0.03)


# ==============================================================================
# 4. BOSS ARENA KIT (Art Bible 09: Dark Walnut + Glass Pit + Gears + Balusters + Lanterns)
# ==============================================================================
def build_radial_wood_deck(name, r_in, r_out, height, segs, radial_rings, mat, parent=None):
    """Annular wooden deck with polar radial plank UVs (U=radial plank length, V=circumferential plank strips)."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()
    z_top = 0.0
    z_bot = -height
    chamfer = 0.045

    # Build top surface rings (r_in .. r_out) + inner/outer beveled walls + bottom ring
    # Profile loops per angle aIdx (0..segs, unmerged at seam so UV V goes cleanly 0..8 without wrap glitch!)
    prof_top = []
    for k in range(radial_rings + 1):
        t = k / radial_rings
        r = r_in + (r_out - r_in) * t
        prof_top.append((r, z_top))
    # Outer bevel -> outer bottom -> inner bottom -> inner bevel back to r_in
    prof_all = (
        [(r_in + chamfer, z_top)]
        + prof_top[1:-1]
        + [
            (r_out - chamfer, z_top),
            (r_out, z_top - chamfer),
            (r_out, z_bot + chamfer),
            (r_out - chamfer, z_bot),
            (r_in + chamfer, z_bot),
            (r_in, z_bot + chamfer),
            (r_in, z_top - chamfer),
            (r_in + chamfer, z_top),
        ]
    )

    cols = []
    n_p = len(prof_all) - 1
    for aIdx in range(segs + 1):
        a = 2.0 * math.pi * (aIdx / segs)
        ca, sa = math.cos(a), math.sin(a)
        v_ring = (aIdx / segs) * 8.0
        col = []
        for pi in range(n_p):
            r, z = prof_all[pi]
            col.append(bm.verts.new((ca * r, sa * r, z)))
        cols.append((col, v_ring))

    for aIdx in range(segs):
        col0, v0 = cols[aIdx]
        col1, v1 = cols[aIdx + 1]
        for pi in range(n_p):
            npi = (pi + 1) % n_p
            f = bm.faces.new((col0[pi], col0[npi], col1[npi], col1[pi]))
            r0, z0 = prof_all[pi]
            r1, z1 = prof_all[npi]
            # Radial U along plank grain + slight offset for vertical side walls
            u0 = (r0 - r_in) / 4.2 + (z0 * 0.25)
            u1 = (r1 - r_in) / 4.2 + (z1 * 0.25)
            uvs_quad = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
            for loop, uv_val in zip(f.loops, uvs_quad):
                loop[uv_layer].uv = uv_val

    return finalize_mesh_obj(name, bm, mat, parent, uv_scale=None, weighted=True)


def build_boss_arena_deck(m):
    """Radius 18.5m dark-walnut circular deck with sunken central cogwheel pit (R=5.7m, depth 1.65m),
    top surface strictly at Blender Z=0 (= Three.js Y=0 local -> Y=4.0 world)."""
    root = new_empty("BossArenaDeck")
    # Solid lower drum & sunken pit floor (Z = -2.4 .. -1.65)
    new_cyl("BottomDrum", 18.5, 16.8, 0.95, m["dark_walnut"], root, (0, 0, -2.05), segs=64, bevel=0.06, uv_scale=0.08)
    # Raised outer radial walnut plank deck (r_in=5.72, r_out=18.5, top Z=0.0, bottom Z=-1.65)
    build_radial_wood_deck("OuterWoodDeck", 5.72, 18.5, 1.65, 64, 5, m["dark_walnut"], root)
    # Raised walnut/oak step border on perimeter (widened inward to R=17.10 so lantern bases stay 100% inside!)
    new_full_annulus("OuterWalnutRim", 17.10, 18.65, 0.24, 64, m["honey_oak"], root, (0, 0, 0.06), bevel=0.04)
    # Twin concentric flush/slightly-raised brass rings matching Art Bible 09!
    new_full_annulus("InnerBrassFrame", 5.55, 6.20, 0.20, 64, m["brass"], root, (0, 0, 0.04), bevel=0.035)
    new_full_annulus("MidBrassRing", 11.45, 11.95, 0.14, 64, m["brass"], root, (0, 0, 0.02), bevel=0.025)
    # 8 carved recessed walnut medallions with raised 8-point brass stars around the deck (Art Bible 09!)
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8
        rx, ry = math.cos(a) * 8.9, math.sin(a) * 8.9
        new_cyl(f"MedallionRim_{i}", 1.12, 1.16, 0.09, m["honey_oak"], root, (rx, ry, 0.02), segs=28, bevel=0.025)
        new_cyl(f"MedallionWell_{i}", 0.92, 0.92, 0.08, m["dark_walnut"], root, (rx, ry, 0.035), segs=24, bevel=0.01, uv_scale=0.35)
        new_star_prism(f"MedallionStar_{i}", 0.80, 0.36, 6, 0.11, m["brass"], root, (rx, ry, 0.055))


def build_boss_arena_glass(m):
    root = new_empty("BossArenaGlass")
    new_cyl("GlassDisk", 5.62, 5.62, 0.08, m["glass"], root, (0, 0, -0.04), segs=64, bevel=0.01)
    # Crossed subtle brass mullions framing under-floor glass window (Art Bible 09!)
    for ang in (0.0, math.pi / 2, math.pi / 4, -math.pi / 4):
        new_box(f"Mullion_{ang:.2f}", (11.1, 0.18, 0.10), m["brass"], root, (0, 0, -0.03), rot=(0, 0, ang), bevel=0.02)
    new_cyl("CenterGlassHub", 0.92, 1.02, 0.24, m["brass"], root, (0, 0, 0.02), segs=28, bevel=0.03)


def build_boss_baluster_section(m):
    """22.5-deg arc (1/16 circle) of turned wooden balusters & continuous rails at R=17.75m."""
    root = new_empty("BossBalusterSection")
    r_rail = 17.75
    span = math.radians(22.5)
    a0, a1 = -span * 0.50, span * 0.50
    # Bottom plinth rail & contoured top handrail
    new_ring_sector("BottomPlinth", r_rail - 0.19, r_rail + 0.19, 0.24, a0, a1, 10, m["honey_oak"], root, (0, 0, 0.12), bevel=0.03)
    new_ring_sector("TopHandrail", r_rail - 0.25, r_rail + 0.25, 0.22, a0, a1, 10, m["honey_oak"], root, (0, 0, 1.44), bevel=0.045)
    # 6 lathe-turned wooden balusters per bay
    for k in range(6):
        a = a0 + (a1 - a0) * ((k + 0.5) / 6.0)
        bx, by = math.cos(a) * r_rail, math.sin(a) * r_rail
        new_cyl(f"BalBase_{k}", 0.125, 0.095, 0.26, m["honey_oak"], root, (bx, by, 0.34), segs=14, bevel=0.02)
        new_sphere(f"BalBelly_{k}", 0.14, m["honey_oak"], root, (bx, by, 0.68), scale=(1, 1, 1.65), segs=16, rings=10)
        new_cyl(f"BalNeck_{k}", 0.08, 0.115, 0.48, m["honey_oak"], root, (bx, by, 1.12), segs=14, bevel=0.02)
    # Turned wooden joinery post at seam (cleanly fits inside lantern posts at every 45 deg too!)
    mx, my = math.cos(a0) * r_rail, math.sin(a0) * r_rail
    new_box("MidPost", (0.30, 0.30, 1.62), m["honey_oak"], root, (mx, my, 0.81), rot=(0, 0, a0), bevel=0.04)
    new_sphere("MidPostCap", 0.16, m["honey_oak"], root, (mx, my, 1.68), segs=16, rings=10)


def build_boss_lantern_post(m):
    """Sturdy wooden balustrade corner post with bracket & warm glowing 4-pane lantern (height 3.8m)."""
    root = new_empty("BossLanternPost")
    new_box("Foot", (0.50, 0.50, 0.34), m["dark_walnut"], root, (0, 0, 0.17), bevel=0.04)
    new_box("Shaft", (0.42, 0.42, 2.75), m["honey_oak"], root, (0, 0, 1.70), bevel=0.045)
    new_box("Cap", (0.54, 0.54, 0.20), m["honey_oak"], root, (0, 0, 3.16), bevel=0.04)
    new_sphere("Finial", 0.17, m["brass"], root, (0, 0, 3.38))
    # Large warm 4-pane wooden lantern on inner bracket (-Y faces arena center when aligned!)
    lx, ly = 0.0, -0.52
    new_box("BracketArm", (0.16, 0.66, 0.16), m["brass"], root, (0, -0.28, 2.98), bevel=0.02)
    new_box("LanternCore", (0.46, 0.46, 0.62), m["lantern"], root, (lx, ly, 2.52), bevel=0.025)
    for cx in (-0.23, 0.23):
        for cy in (ly - 0.23, ly + 0.23):
            new_cyl(f"Strut_{cx}_{cy}", 0.035, 0.035, 0.64, m["dark_walnut"], root, (cx, cy, 2.52), segs=8, bevel=0.006)
    new_box("LanternBase", (0.56, 0.56, 0.12), m["dark_walnut"], root, (lx, ly, 2.18), bevel=0.025)
    new_cone("LanternRoof", 0.48, 0.07, 0.34, m["dark_walnut"], root, (lx, ly, 2.98), segs=4, rot=(0, 0, math.pi / 4))


# ==============================================================================
# 5. PRE-INTEGRATION EEVEE VISUAL QA SHEETS (vs Manmarubuu & Target Aesthetics!)
# ==============================================================================
def import_asset(path: Path, loc=(0, 0, 0), rot_z=0.0, target_height=None, scale=None, align_bottom=True):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    added = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in added if o.parent not in added]
    wrap = new_empty(f"QA_{path.stem}", None, loc)
    wrap.rotation_euler = (0, 0, rot_z)
    for r in roots:
        r.parent = wrap
    bpy.context.view_layer.update()
    mn, mx = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for o in added:
        if o.type == "MESH":
            for c in o.bound_box:
                wc = o.matrix_world @ Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], wc[k])
                    mx[k] = max(mx[k], wc[k])
    if mn.x < 1e8:
        sc = (target_height / max(0.01, mx.z - mn.z)) if target_height else (scale or 1.0)
        wrap.scale = (sc, sc, sc)
        bpy.context.view_layer.update()
        if align_bottom:
            mn2_z = min((o.matrix_world @ Vector(c)).z for o in added if o.type == "MESH" for c in o.bound_box)
            wrap.location.z -= (mn2_z - loc[2])
    return wrap


def render_qa_sheets():
    def setup_scene(dusk=False):
        scene = clear_scene()
        engines = [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items]
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
        scene.render.resolution_x = 960
        scene.render.resolution_y = 640
        scene.view_settings.exposure = -0.35 if dusk else -0.45
        if scene.world is None:
            scene.world = bpy.data.worlds.new("QAWorld")
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.14, 0.16, 0.30, 1.0) if dusk else (0.52, 0.78, 0.96, 1.0)
            bg.inputs[1].default_value = 0.75 if dusk else 0.85

        sun_d = bpy.data.lights.new("Sun", type="SUN")
        sun_d.energy = 2.6 if dusk else 3.0
        sun_d.color = (1.0, 0.74, 0.42) if dusk else (1.0, 0.93, 0.80)
        sun = bpy.data.objects.new("Sun", sun_d)
        scene.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(66 if dusk else 54), math.radians(15), math.radians(-35))

        cam_d = bpy.data.cameras.new("QACam")
        cam_d.lens = 38
        cam = bpy.data.objects.new("QACam", cam_d)
        scene.collection.objects.link(cam)
        scene.camera = cam
        return scene, cam

    # Sheet 1: Diorama Field Kit vs 1.0m Manmarubuu
    scene, cam = setup_scene(dusk=False)
    bpy.ops.mesh.primitive_cylinder_add(radius=22, depth=0.3, location=(0, 0, -0.15))
    fl = bpy.context.active_object
    fl.data.materials.append(make_mat("GrassFloor", (0.30, 0.56, 0.20), roughness=0.90))
    import_asset(HERO_GLB, loc=(-1.2, -3.5, 0), target_height=1.0)
    import_asset(OUT_DIR / "patchwork_rug.glb", loc=(-0.5, -5.0, 0), scale=0.65)
    import_asset(OUT_DIR / "castle_arch_gate.glb", loc=(0, 4.2, 0), scale=0.85)
    import_asset(OUT_DIR / "castle_keep_center.glb", loc=(-6.5, 5.2, 0), scale=0.65)
    import_asset(OUT_DIR / "toy_house_red.glb", loc=(6.5, 2.5, 0), scale=1.0)
    import_asset(OUT_DIR / "wood_rail_bridge.glb", loc=(4.8, -1.0, 0.55), scale=0.72)
    import_asset(OUT_DIR / "wood_domino_bevel.glb", loc=(1.8, -1.2, 0.92), scale=0.85)
    import_asset(OUT_DIR / "wood_domino_bevel.glb", loc=(2.5, -1.2, 0.92), scale=0.85)
    import_asset(OUT_DIR / "trampoline_wood_coil.glb", loc=(4.8, -4.0, 0), scale=0.9)
    import_asset(OUT_DIR / "trampoline_red_coil.glb", loc=(-4.8, -2.5, 0), scale=0.9)
    import_asset(OUT_DIR / "trampoline_mini_pastel.glb", loc=(-3.2, -4.8, 0), scale=0.8)
    import_asset(OUT_DIR / "stepping_stone_round.glb", loc=(0.2, -2.2, 0), scale=1.0)
    import_asset(OUT_DIR / "daisy_white.glb", loc=(-2.2, -3.2, 0), scale=1.4)
    import_asset(OUT_DIR / "toy_tree_felt.glb", loc=(-6.5, 0.5, 0), scale=0.9)
    import_asset(OUT_DIR / "toy_fence_wood.glb", loc=(7.0, -3.5, 0), scale=1.0)
    cam.location = Vector((0.4, -14.2, 5.6))
    cam.rotation_euler = (Vector((0, 0.8, 1.8)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    p1 = GAME_ROOT / "blender" / "qa_sheet_diorama_kit.png"
    scene.render.filepath = str(p1)
    bpy.ops.render.render(write_still=True)

    # Sheet 2: Boss Arena Kit (Dark Walnut Deck, Glass Pit, Clockwork Gears, Balusters, Lanterns, Boss)
    scene, cam = setup_scene(dusk=True)
    import_asset(OUT_DIR / "boss_arena_deck.glb", loc=(0, 0, 0), align_bottom=False)
    import_asset(OUT_DIR / "boss_arena_glass.glb", loc=(0, 0, 0), align_bottom=False)
    import_asset(OUT_DIR / "boss_gear_large.glb", loc=(0, 0, -0.78), align_bottom=False)
    import_asset(OUT_DIR / "boss_gear_medium.glb", loc=(-3.4, 2.2, -0.95), align_bottom=False)
    import_asset(OUT_DIR / "boss_gear_small.glb", loc=(3.6, -1.8, -1.05), align_bottom=False)
    for i in range(16):
        import_asset(OUT_DIR / "boss_baluster_section.glb", loc=(0, 0, 0), rot_z=2 * math.pi * i / 16)
    for i in range(8):
        a = 2 * math.pi * i / 8
        import_asset(OUT_DIR / "boss_lantern_post.glb", loc=(math.cos(a) * 17.75, math.sin(a) * 17.75, 0), rot_z=a + math.pi / 2)
    import_asset(OUT_DIR / "trampoline_red_coil.glb", loc=(-11.5, -1.5, 0), scale=1.05)
    import_asset(OUT_DIR / "trampoline_red_coil.glb", loc=(11.5, -1.5, 0), scale=1.05)
    import_asset(HERO_GLB, loc=(-2.4, -7.2, 0), target_height=1.0)
    import_asset(BOSS_GLB, loc=(0.5, 7.0, 0), target_height=6.0)
    cam.location = Vector((-1.5, -22.5, 7.8))
    cam.rotation_euler = (Vector((0, 0.5, 1.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    p2 = GAME_ROOT / "blender" / "qa_sheet_boss_arena_kit.png"
    scene.render.filepath = str(p2)
    bpy.ops.render.render(write_still=True)
    print("Saved QA sheets:", p1, p2)


def main():
    assets = [
        ("castle_arch_gate", build_castle_arch_gate),
        ("castle_tower_round", build_castle_tower("red")),
        ("castle_tower_blue", build_castle_tower("blue")),
        ("castle_keep_center", build_castle_keep_center),
        ("castle_stairs_wood", build_castle_stairs_wood),
        ("castle_wall_crenel", build_castle_wall_crenel),
        ("toy_house_red", build_toy_house("red")),
        ("toy_house_blue", build_toy_house("blue")),
        ("wood_rail_bridge", build_wood_rail_bridge),
        ("bevel_cube_wood", build_bevel_cube_wood),
        ("bevel_cylinder_wood", build_bevel_cylinder_wood),
        ("toy_platform_slab", build_toy_platform_slab),
        ("checkpoint_flag_felt", build_checkpoint_flag_felt),
        ("alphabet_block_bevel", build_alphabet_block_bevel),
        ("wood_crate_bevel", build_wood_crate_bevel),
        ("wood_domino_bevel", build_wood_domino_bevel),
        ("bowling_pin_smooth", build_bowling_pin_smooth),
        ("trampoline_red_coil", build_trampoline_coil(wood_top=False)),
        ("trampoline_wood_coil", build_trampoline_coil(wood_top=True)),
        ("trampoline_mini_pastel", build_trampoline_mini_pastel),
        ("stepping_stone_round", build_stepping_stone_round),
        ("stepping_stone_plank", build_stepping_stone_plank),
        ("patchwork_rug", build_patchwork_rug),
        ("daisy_white", build_daisy_white),
        ("toy_tree_felt", build_toy_tree_felt),
        ("toy_fence_wood", build_toy_fence_wood),
        ("star_gate_clockwork", build_star_gate_clockwork),
        ("boss_arena_deck", build_boss_arena_deck),
        ("boss_arena_glass", build_boss_arena_glass),
        ("boss_gear_large", lambda m: new_gear_xy("GearLarge", 3.3, 0.36, 16, m["brass"], spokes=6)),
        ("boss_gear_medium", lambda m: new_gear_xy("GearMedium", 1.95, 0.32, 12, m["brass"], spokes=4)),
        ("boss_gear_small", lambda m: new_gear_xy("GearSmall", 1.25, 0.30, 10, m["brass"], spokes=4)),
        ("boss_baluster_section", build_boss_baluster_section),
        ("boss_lantern_post", build_boss_lantern_post),
    ]
    for fname, fn in assets:
        save_asset(fname, fn)
    render_qa_sheets()
    print("===ALL_DIORAMA_ASSETS_AND_QA_DONE===")


if __name__ == "__main__":
    main()
