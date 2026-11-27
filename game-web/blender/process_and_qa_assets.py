"""Generate high-detail Subdivision/Bevel toybox assets & smooth props in Blender 5.2,
upgrade CLOCKWORK TOY KING, verify triangle counts, and render side-by-side QA panels
next to Manmarubuu (manmarubuu_animated.glb).
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

GAME_ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web")
OUT_AI = GAME_ROOT / "public" / "models" / "ai"
OUT_SMOOTH = GAME_ROOT / "public" / "models" / "toybox_smooth"
PBR_DIR = GAME_ROOT / "public" / "textures" / "pbr"
HERO_GLB = GAME_ROOT / "public" / "models" / "manmarubuu_animated.glb"
KAYKIT_DIR = GAME_ROOT / "public" / "models" / "kaykit"
TMP_QA = GAME_ROOT / "blender" / "_tmp_qa_panels"

OUT_AI.mkdir(parents=True, exist_ok=True)
OUT_SMOOTH.mkdir(parents=True, exist_ok=True)
TMP_QA.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    return scene


def count_tris():
    total = 0
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            dg = bpy.context.evaluated_depsgraph_get()
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
        export_tangents=True,
        export_image_format="AUTO",
    )


def make_wood_img(name: str, c1, c2, size=256):
    img = bpy.data.images.new(name, width=size, height=size)
    px = [0.0] * (size * size * 4)
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            g = 0.5 + 0.30 * math.sin(u * 40.0 + math.sin(v * 7.0) * 1.6) + 0.14 * math.sin(u * 92.0 + v * 5.0)
            g = max(0.0, min(1.0, g)) * 0.32
            idx = (y * size + x) * 4
            px[idx] = c1[0] * (1 - g) + c2[0] * g
            px[idx + 1] = c1[1] * (1 - g) + c2[1] * g
            px[idx + 2] = c1[2] * (1 - g) + c2[2] * g
            px[idx + 3] = 1.0
    img.pixels.foreach_set(px)
    img.pack()
    return img


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
    color=(1, 1, 1),
    metallic=0.0,
    roughness=0.5,
    coat=0.0,
    coat_rough=0.1,
    emission=None,
    emission_strength=0.0,
    color_img=None,
    normal_img=None,
    normal_strength=0.45,
):
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
    if color_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = color_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
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


def add_subsurf(ob, levels=2):
    mod = ob.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels


def add_bevel(ob, width=0.02, segments=2):
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments


def set_smooth(ob):
    if ob.type == "MESH" and ob.data.polygons:
        ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))


def new_empty(name, parent=None, loc=(0, 0, 0)):
    em = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(em)
    if parent:
        em.parent = parent
    em.location = loc
    return em


def new_box(name, size, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.02, subsurf=0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    set_smooth(ob)
    if subsurf > 0:
        add_subsurf(ob, subsurf)
    if parent:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def new_cyl(name, r1, r2, depth, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), segs=28, bevel=0.015):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    if bevel > 0:
        rim = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.001]
        if rim:
            bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=2, affect="EDGES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    set_smooth(ob)
    if parent:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def new_sphere(name, r, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=24, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    set_smooth(ob)
    if parent:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def new_torus(name, R, r, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), maj=32, min_s=14):
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
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    set_smooth(ob)
    if parent:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def new_gear(name, radius, thickness, teeth, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    segs = teeth * 4
    ir, mr, orad = radius * 0.44, radius * 0.80, radius
    tz, bz = thickness * 0.5, -thickness * 0.5
    to, bo, ti, bi = [], [], [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        r = orad if (i % 4 in (1, 2)) else mr
        cx, cy = math.cos(a), math.sin(a)
        to.append(bm.verts.new((cx * r, cy * r, tz)))
        bo.append(bm.verts.new((cx * r, cy * r, bz)))
        ti.append(bm.verts.new((cx * ir, cy * ir, tz)))
        bi.append(bm.verts.new((cx * ir, cy * ir, bz)))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((to[i], to[j], ti[j], ti[i]))
        bm.faces.new((bi[i], bi[j], bo[j], bo[i]))
        bm.faces.new((bo[i], bo[j], to[j], to[i]))
        bm.faces.new((ti[i], ti[j], bi[j], bi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if parent:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


# =====================================================================
# 1. BOSS KING UPGRADED HIGH-DETAIL (6.0m, +Y back key, -Y front -> +Z Three.js)
# =====================================================================
def build_boss_king():
    scene = clear_scene()
    nor_pine = load_packed_image(PBR_DIR / "coated_pine" / "nor_gl.jpg", non_color=True)
    nor_metal = load_packed_image(PBR_DIR / "metal_plate_02" / "nor_gl.jpg", non_color=True)

    img_blue = make_wood_img("KingBlue", (0.14, 0.25, 0.52), (0.09, 0.16, 0.36))
    img_cream = make_wood_img("KingCream", (0.89, 0.77, 0.54), (0.76, 0.64, 0.42))
    img_walnut = make_wood_img("KingWalnut", (0.39, 0.23, 0.14), (0.25, 0.14, 0.08))
    img_pale = make_wood_img("KingPale", (0.79, 0.68, 0.53), (0.67, 0.55, 0.41))

    m_blue = make_mat("RoyalBlueWood", metallic=0.04, roughness=0.42, coat=0.18, color_img=img_blue, normal_img=nor_pine, normal_strength=0.35)
    m_cream = make_mat("CreamTrimWood", metallic=0.04, roughness=0.40, coat=0.15, color_img=img_cream, normal_img=nor_pine, normal_strength=0.28)
    m_walnut = make_mat("WalnutWood", metallic=0.02, roughness=0.48, color_img=img_walnut, normal_img=nor_pine, normal_strength=0.45)
    m_pale = make_mat("PaleWood", metallic=0.02, roughness=0.50, color_img=img_pale, normal_img=nor_pine, normal_strength=0.30)
    m_brass = make_mat("GearBrass", (0.94, 0.72, 0.25), metallic=0.88, roughness=0.24, normal_img=nor_metal, normal_strength=0.25)
    m_gold = make_mat("KeyGold", (1.0, 0.72, 0.12), metallic=0.92, roughness=0.18, emission=(1.0, 0.70, 0.10), emission_strength=0.32)
    m_tin = make_mat("HelmetSteel", (0.56, 0.58, 0.60), metallic=0.76, roughness=0.30, normal_img=nor_metal, normal_strength=0.20)
    m_dark = make_mat("DarkSteel", (0.13, 0.15, 0.19), metallic=0.45, roughness=0.48)
    m_eye = make_mat("GlowEyes", (1.0, 0.84, 0.22), roughness=0.12, emission=(1.0, 0.82, 0.18), emission_strength=4.5)
    m_gem = make_mat("CrownBlueGem", (0.22, 0.44, 0.86), roughness=0.15, coat=0.9)

    root = new_empty("BossRoot", None, (0, 0, 0))
    pelvis = new_empty("Pelvis", root, (0, 0, 1.95))

    new_cyl("PelvisCore", 0.94, 0.98, 0.54, m_blue, pelvis, (0, 0, 0), bevel=0.04)
    new_cyl("BeltTrim", 1.04, 1.04, 0.20, m_cream, pelvis, (0, 0, 0.23), bevel=0.03)
    new_gear("BellyGear", 0.54, 0.20, 14, m_brass, pelvis, (0, -0.80, 0.34), rot=(math.pi / 2, 0, 0))
    new_gear("WaistGearRing", 1.00, 0.16, 26, m_brass, pelvis, (0, 0, 0.36))

    # Detachable skirt plates with layered cream trim & diamond centers
    sk_f = new_box("Armor_Skirt_F", (1.00, 0.20, 0.86), m_blue, pelvis, (0, -0.96, -0.26), rot=(math.radians(-14), 0, 0), bevel=0.05)
    new_box("Armor_Skirt_F_Trim", (1.10, 0.24, 0.15), m_cream, sk_f, (0, 0, -0.37), bevel=0.03)
    sk_b = new_box("Armor_Skirt_B", (1.00, 0.20, 0.86), m_blue, pelvis, (0, 0.96, -0.26), rot=(math.radians(14), 0, 0), bevel=0.05)
    new_box("Armor_Skirt_B_Trim", (1.10, 0.24, 0.15), m_cream, sk_b, (0, 0, -0.37), bevel=0.03)
    sk_l = new_box("Armor_Skirt_L", (0.20, 1.18, 0.82), m_blue, pelvis, (1.02, 0, -0.24), rot=(0, math.radians(-14), 0), bevel=0.05)
    new_box("Armor_Skirt_L_Trim", (0.24, 1.26, 0.15), m_cream, sk_l, (0, 0, -0.35), bevel=0.03)
    sk_r = new_box("Armor_Skirt_R", (0.20, 1.18, 0.82), m_blue, pelvis, (-1.02, 0, -0.24), rot=(0, math.radians(14), 0), bevel=0.05)
    new_box("Armor_Skirt_R_Trim", (0.24, 1.26, 0.15), m_cream, sk_r, (0, 0, -0.35), bevel=0.03)

    # Legs
    for side, sx in (("L", 1.0), ("R", -1.0)):
        leg = new_empty(f"Leg_{side}", pelvis, (sx * 0.72, 0, -0.15))
        new_cyl(f"Thigh_{side}", 0.36, 0.30, 0.78, m_pale, leg, (0, 0, -0.42), bevel=0.03)
        new_gear(f"KneeGear_{side}", 0.36, 0.24, 12, m_brass, leg, (0, 0, -0.84), rot=(0, math.pi / 2, 0))
        new_box(f"KneePad_{side}", (0.36, 0.18, 0.36), m_cream, leg, (0, -0.36, -0.84), rot=(0, math.radians(45), 0), bevel=0.04)
        new_box(f"Shin_{side}", (0.66, 0.72, 0.66), m_blue, leg, (0, 0, -1.24), bevel=0.06)
        new_box(f"Boot_{side}", (0.78, 1.12, 0.44), m_blue, leg, (0, -0.18, -1.58), bevel=0.07)
        new_box(f"BootTrim_{side}", (0.84, 1.18, 0.14), m_cream, leg, (0, -0.18, -1.36), bevel=0.03)

    # Torso
    torso = new_empty("Torso", pelvis, (0, 0, 0.48))
    new_box("ChestMain", (2.18, 1.66, 1.70), m_blue, torso, (0, 0, 0.88), bevel=0.10)
    new_box("ChestFrontShield", (0.80, 0.48, 1.40), m_cream, torso, (0, -0.80, 0.90), bevel=0.06)
    new_box("ChestTopTrim", (2.30, 1.76, 0.18), m_cream, torso, (0, 0, 1.68), bevel=0.04)
    new_torus("CollarTorus", 0.84, 0.12, m_cream, torso, (0, 0, 1.80))
    for k in range(8):
        ang = (2 * math.pi * k) / 8 + 0.39
        new_sphere(f"CollarRivet_{k}", 0.045, m_brass, torso, (math.cos(ang) * 0.86, math.sin(ang) * 0.86, 1.90))
    new_gear("RibGear_L", 0.58, 0.16, 14, m_brass, torso, (1.04, 0.0, 0.72), rot=(0, math.pi / 2, 0))
    new_gear("RibGear_R", 0.58, 0.16, 14, m_brass, torso, (-1.04, 0.0, 0.72), rot=(0, math.pi / 2, 0))
    # Back screw bolts matching art-bible 03!
    for bx, bz in ((-0.75, 1.38), (0.75, 1.38), (-0.75, 0.45), (0.75, 0.45)):
        new_cyl(f"BackRivet_{bx}_{bz}", 0.075, 0.075, 0.10, m_brass, torso, (bx, 0.84, bz), rot=(math.pi / 2, 0, 0), bevel=0.01)

    # Ornate Back Windup Key (WEAK POINT)
    key_pivot = new_empty("BackWindupKey", torso, (0, 0.86, 0.98))
    new_cyl("KeyBaseMount", 0.68, 0.64, 0.18, m_gold, key_pivot, (0, 0.05, 0), rot=(math.pi / 2, 0, 0), bevel=0.03)
    new_cyl("KeyBaseBoss", 0.44, 0.40, 0.24, m_gold, key_pivot, (0, 0.16, 0), rot=(math.pi / 2, 0, 0), bevel=0.03)
    new_cyl("KeyShaft", 0.20, 0.22, 0.76, m_gold, key_pivot, (0, 0.45, 0), rot=(math.pi / 2, 0, 0), bevel=0.02)
    new_torus("KeyBowUpper", 0.56, 0.13, m_gold, key_pivot, (0, 0.82, 0.46), rot=(math.pi / 2, 0, 0))
    new_torus("KeyBowLower", 0.56, 0.13, m_gold, key_pivot, (0, 0.82, -0.46), rot=(math.pi / 2, 0, 0))
    new_torus("KeyBowTip", 0.36, 0.11, m_gold, key_pivot, (0, 0.82, 0.0), rot=(math.pi / 2, 0, 0))
    new_torus("KeyScrollU", 0.22, 0.06, m_gold, key_pivot, (0, 0.82, 0.46), rot=(math.pi / 2, 0, 0))
    new_torus("KeyScrollL", 0.22, 0.06, m_gold, key_pivot, (0, 0.82, -0.46), rot=(math.pi / 2, 0, 0))
    new_box("KeyCenterBar", (0.20, 0.24, 1.10), m_gold, key_pivot, (0, 0.82, 0), bevel=0.04)

    # Head, Glowing Eyes, Crown with Gems & Feather Plume
    head = new_empty("Head", torso, (0, 0, 1.84))
    new_cyl("HeadCore", 0.66, 0.62, 0.90, m_tin, head, (0, 0, 0.44), bevel=0.04)
    new_box("FaceDarkSlot", (0.94, 0.44, 0.28), m_dark, head, (0, -0.48, 0.46), bevel=0.03)
    new_sphere("Eye_L", 0.125, m_eye, head, (0.24, -0.66, 0.46), scale=(1.25, 0.6, 0.95))
    new_sphere("Eye_R", 0.125, m_eye, head, (-0.24, -0.66, 0.46), scale=(1.25, 0.6, 0.95))

    new_sphere("HelmetDome", 0.74, m_blue, head, (0, 0, 0.72), scale=(1.0, 1.0, 0.74))
    new_cyl("VisorBand", 0.76, 0.76, 0.22, m_blue, head, (0, 0, 0.70), bevel=0.03)
    for vx in (-0.38, -0.20, 0.0, 0.20, 0.38):
        new_box(f"VisorBar_{vx:.2f}", (0.068, 0.15, 0.24), m_blue, head, (vx, -0.70, 0.64), bevel=0.015)

    new_cyl("CrownBand", 0.58, 0.70, 0.34, m_brass, head, (0, 0, 1.12), bevel=0.03)
    for k in range(6):
        ang = (2 * math.pi * k) / 6
        px, py = math.cos(ang) * 0.64, math.sin(ang) * 0.64
        new_cyl(f"CrownSpike_{k}", 0.085, 0.02, 0.26, m_brass, head, (px, py, 1.35), bevel=0.01)
        new_sphere(f"CrownOrb_{k}", 0.08, m_brass, head, (px, py, 1.48))
        new_sphere(f"CrownGem_{k}", 0.065, m_gem, head, (math.cos(ang + 0.52) * 0.67, math.sin(ang + 0.52) * 0.67, 1.14), scale=(0.9, 0.9, 1.2))
    new_sphere("PlumeBase", 0.23, m_blue, head, (0, 0.05, 1.40), scale=(0.8, 1.2, 1.5))
    new_sphere("PlumeCrest", 0.25, m_blue, head, (0, 0.28, 1.68), scale=(0.7, 1.35, 1.35))

    # Shoulders, Detachable Rounded Pauldrons, Articulated Arms & Walnut Gauntlets
    for side, sx in (("L", 1.0), ("R", -1.0)):
        sh = new_empty(f"Shoulder_{side}", torso, (sx * 1.52, 0, 1.24))
        new_gear(f"ShoulderGear_{side}", 0.46, 0.22, 12, m_brass, sh, (-sx * 0.18, 0, 0), rot=(0, math.pi / 2, 0))

        pauldron = new_box(f"Armor_Shoulder_{side}", (1.14, 1.44, 1.10), m_blue, sh, (sx * 0.18, 0, 0.06), bevel=0.12)
        new_box(f"Armor_Shoulder_Trim_{side}", (1.22, 1.52, 0.18), m_cream, pauldron, (0, 0, -0.46), bevel=0.04)
        new_box(f"Armor_Shoulder_Band_{side}", (0.20, 1.50, 1.14), m_cream, pauldron, (-sx * 0.48, 0, 0.02), bevel=0.03)

        arm = new_empty(f"Arm_{side}", sh, (sx * 0.28, 0, -0.58))
        new_cyl(f"UpperArm_{side}", 0.35, 0.31, 0.84, m_pale, arm, (0, 0, -0.42), bevel=0.03)
        new_gear(f"ElbowGear_{side}", 0.38, 0.26, 12, m_brass, arm, (0, 0, -0.84), rot=(0, math.pi / 2, 0))

        gauntlet = new_empty(f"Gauntlet_{side}", arm, (0, 0, -0.94))
        new_box(f"CuffTrim_{side}", (1.02, 1.02, 0.24), m_cream, gauntlet, (0, 0, -0.10), bevel=0.04)
        new_box(f"ForearmBlock_{side}", (0.94, 0.94, 1.04), m_walnut, gauntlet, (0, 0, -0.70), bevel=0.08)
        new_box(f"FistCore_{side}", (0.88, 0.88, 0.70), m_walnut, gauntlet, (0, -0.04, -1.42), bevel=0.08)
        new_box(f"FistPlate_{side}", (0.32, 0.74, 0.58), m_blue, gauntlet, (sx * 0.37, -0.04, -1.44), bevel=0.04)
        new_box(f"Thumb_{side}", (0.32, 0.38, 0.44), m_walnut, gauntlet, (-sx * 0.34, -0.34, -1.36), bevel=0.06)

    out = OUT_AI / "boss_king.glb"
    export_glb(out)
    print(f"BUILT boss_king.glb: tris={count_tris()}, bytes={out.stat().st_size}")


# =====================================================================
# 2. WINDUP TANK (Art-Bible 02 Top-Left, height ~1.35m, -Y forward)
# =====================================================================
def build_windup_tank():
    clear_scene()
    nor_pine = load_packed_image(PBR_DIR / "coated_pine" / "nor_gl.jpg", non_color=True)
    img_pale = make_wood_img("TankWood", (0.86, 0.73, 0.55), (0.72, 0.58, 0.42))

    m_mint = make_mat("TankMintShell", (0.58, 0.87, 0.84), roughness=0.28, coat=0.55, coat_rough=0.14)
    m_pink = make_mat("TankPinkSide", (0.95, 0.65, 0.76), roughness=0.32, coat=0.45)
    m_wood = make_mat("TankWood", roughness=0.46, color_img=img_pale, normal_img=nor_pine, normal_strength=0.35)
    m_chrome = make_mat("TankChrome", (0.86, 0.88, 0.90), metallic=0.92, roughness=0.16)
    m_gold = make_mat("TankBrassKey", (0.96, 0.76, 0.25), metallic=0.90, roughness=0.20)
    m_tire = make_mat("TankTire", (0.16, 0.16, 0.18), roughness=0.72)
    m_white = make_mat("TankEyeWhite", (0.98, 0.98, 0.98), roughness=0.18, coat=0.8)
    m_dark = make_mat("TankPupil", (0.11, 0.10, 0.12), roughness=0.2)

    root = new_empty("TankRoot", None, (0, 0, 0))
    # Rounded capsule-barrel toy body (axis along X)
    new_sphere("BodyMint", 0.54, m_mint, root, (0, 0, 0.66), scale=(1.08, 1.0, 1.0), segs=32, rings=22)
    # Pink side bands & natural wooden side caps + silver trim rings matching art-bible 02!
    for sx in (-1.0, 1.0):
        new_cyl(f"PinkShoulder_{sx}", 0.47, 0.50, 0.16, m_pink, root, (sx * 0.40, 0, 0.66), rot=(0, math.pi / 2, 0), bevel=0.025)
        new_cyl(f"WoodSideCap_{sx}", 0.39, 0.39, 0.10, m_wood, root, (sx * 0.51, 0, 0.66), rot=(0, math.pi / 2, 0), bevel=0.02)
        new_torus(f"ChromeRim_{sx}", 0.49, 0.024, m_chrome, root, (sx * 0.33, 0, 0.66), rot=(0, math.pi / 2, 0))

    # Rounded wooden snout face plate (-Y forward!) & hollow-looking barrel muzzle
    new_box("WoodenJawPlate", (0.64, 0.42, 0.38), m_wood, root, (0, -0.34, 0.38), bevel=0.08)
    new_cyl("MouthHole", 0.055, 0.055, 0.06, m_dark, root, (0, -0.55, 0.33), rot=(math.pi / 2, 0, 0), bevel=0.01)

    # Cannon socket collar & chunkier wooden barrel angled up-forward (-Y, +Z) matching art-bible 02
    new_torus("CannonSocketRing", 0.22, 0.036, m_dark, root, (0, -0.34, 0.90), rot=(math.radians(38), 0, 0))
    cannon = new_empty("Cannon", root, (0, -0.30, 0.88))
    cannon.rotation_euler = (math.radians(-50), 0, 0)
    new_cyl("CannonShaft", 0.21, 0.175, 0.52, m_wood, cannon, (0, 0, 0.20), bevel=0.025)
    new_torus("CannonLip", 0.205, 0.072, m_wood, cannon, (0, 0, 0.48))
    new_cyl("CannonBore", 0.145, 0.145, 0.20, m_dark, cannon, (0, 0, 0.41), bevel=0.005)

    # Cute googly eyes facing forward (-Y)
    for sx in (-0.19, 0.19):
        eye = new_sphere(f"GooglyEye_{sx}", 0.125, m_white, root, (sx, -0.54, 0.52), scale=(1.0, 0.65, 1.0))
        new_sphere(f"GooglyPupil_{sx}", 0.068, m_dark, eye, (0, -0.055, -0.02), scale=(1.0, 0.7, 1.0))

    # 4 chunkier treaded toy wheels with 12 molded rubber tread lugs, wooden rims & silver hub bolts
    for wx, wy in ((-0.46, -0.34), (0.46, -0.34), (-0.46, 0.34), (0.46, 0.34)):
        wh = new_empty(f"Wheel_{wx}_{wy}", root, (wx, wy, 0.23))
        new_cyl(f"Tire_{wx}_{wy}", 0.225, 0.225, 0.17, m_tire, wh, (0, 0, 0), rot=(0, math.pi / 2, 0), segs=24, bevel=0.03)
        for ti in range(12):
            ta = 2.0 * math.pi * ti / 12.0
            new_box(
                f"Tread_{wx}_{wy}_{ti}",
                (0.14, 0.048, 0.028),
                m_tire,
                wh,
                (0, math.cos(ta) * 0.228, math.sin(ta) * 0.228),
                rot=(-ta, 0, 0),
                bevel=0.008,
            )
        new_cyl(f"Hub_{wx}_{wy}", 0.135, 0.135, 0.185, m_wood, wh, (0, 0, 0), rot=(0, math.pi / 2, 0), segs=20, bevel=0.015)
        new_sphere(f"HubCap_{wx}_{wy}", 0.055, m_chrome, wh, ((0.092 if wx > 0 else -0.092), 0, 0), scale=(0.5, 1, 1))

    # Back Windup Key (+Y back, tilted up) — exact node name 'WindupKey' for spinning in JS!
    key = new_empty("WindupKey", root, (0, 0.44, 0.92))
    key.rotation_euler = (math.radians(-40), 0, 0)
    new_cyl("KeyBase", 0.085, 0.10, 0.09, m_wood, key, (0, 0.02, 0), rot=(math.pi / 2, 0, 0), bevel=0.012)
    new_cyl("KeyStem", 0.054, 0.054, 0.28, m_gold, key, (0, 0.16, 0), rot=(math.pi / 2, 0, 0), bevel=0.012)
    new_torus("KeyEar1", 0.148, 0.042, m_gold, key, (0, 0.36, 0.125), rot=(math.pi / 2, 0, 0))
    new_torus("KeyEar2", 0.148, 0.042, m_gold, key, (0, 0.36, -0.125), rot=(math.pi / 2, 0, 0))
    new_box("KeyBridge", (0.075, 0.08, 0.28), m_gold, key, (0, 0.36, 0), bevel=0.02)

    out = OUT_AI / "windup_tank.glb"
    export_glb(out)
    print(f"BUILT windup_tank.glb: tris={count_tris()}, bytes={out.stat().st_size}")


# =====================================================================
# 3. PROPELLER BALLOON (Art-Bible 02 Top-Right, height ~1.75m, -Y forward)
# =====================================================================
def build_propeller_balloon():
    clear_scene()
    nor_pine = load_packed_image(PBR_DIR / "coated_pine" / "nor_gl.jpg", non_color=True)
    img_cap_light = make_wood_img("CapLightWood", (0.86, 0.72, 0.53), (0.74, 0.60, 0.42))
    img_cap_dark = make_wood_img("CapDarkWood", (0.72, 0.56, 0.38), (0.60, 0.45, 0.29))

    m_balloon = make_mat("LavenderBalloon", (0.64, 0.38, 0.95), roughness=0.14, coat=1.0, coat_rough=0.04)
    m_wood_l = make_mat("CapWoodLight", roughness=0.45, color_img=img_cap_light, normal_img=nor_pine, normal_strength=0.3)
    m_wood_d = make_mat("CapWoodDark", roughness=0.48, color_img=img_cap_dark, normal_img=nor_pine, normal_strength=0.35)
    m_white = make_mat("BalloonEyeW", (0.98, 0.98, 0.98), roughness=0.16, coat=0.7)
    m_dark = make_mat("BalloonDark", (0.14, 0.10, 0.16), roughness=0.22)

    root = new_empty("BalloonRoot", None, (0, 0, 0))
    # Smooth pear/egg balloon silhouette built with bmesh lathe!
    bm = bmesh.new()
    profile = []
    segs = 32
    rings = 24
    for j in range(rings + 1):
        t = j / rings
        ang = t * math.pi
        r = math.sin(ang) * (0.58 - 0.12 * (1 - t))
        z = 0.22 + (1 - math.cos(ang)) * 0.54
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        profile.append(ring)
    for j in range(rings):
        for i in range(segs):
            ni = (i + 1) % segs
            bm.faces.new((profile[j][i], profile[j][ni], profile[j + 1][ni], profile[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("BalloonBody")
    bm.to_mesh(me)
    bm.free()
    b_ob = bpy.data.objects.new("BalloonBody", me)
    bpy.context.scene.collection.objects.link(b_ob)
    b_ob.data.materials.append(m_balloon)
    set_smooth(b_ob)
    b_ob.parent = root

    # Cute bottom tied knot + ring
    new_torus("KnotRing", 0.055, 0.025, m_balloon, root, (0, 0, 0.20))
    new_cyl("KnotSkirt", 0.03, 0.11, 0.13, m_balloon, root, (0, 0, 0.12), bevel=0.015)

    # Angry eyebrows, plump eyes & cute curved frown facing -Y
    for sx in (-0.15, 0.15):
        eye = new_sphere(f"Eye_{sx}", 0.105, m_white, root, (sx, -0.50, 0.78), scale=(1.0, 0.58, 1.05))
        new_sphere(f"Pupil_{sx}", 0.058, m_dark, eye, (-sx * 0.15, -0.05, -0.01), scale=(1.0, 0.6, 1.0))
        brow = new_cyl(f"Brow_{sx}", 0.042, 0.042, 0.24, m_balloon, root, (sx * 1.15, -0.52, 0.90), rot=(0, math.pi / 2 + (0.36 if sx < 0 else -0.36), 0), bevel=0.02)
        new_sphere(f"BrowEndA_{sx}", 0.042, m_balloon, brow, (0, 0, 0.11))
        new_sphere(f"BrowEndB_{sx}", 0.042, m_balloon, brow, (0, 0, -0.11))

    # Curved dark pout mouth (-Y)
    bm_m = bmesh.new()
    pts = [Vector((math.sin(t) * 0.11, -0.53 - math.cos(t) * 0.02, 0.59 - abs(t) * 0.03)) for t in (-1.0, -0.5, 0.0, 0.5, 1.0)]
    prev_v = None
    for p in pts:
        v = bm_m.verts.new(p)
        if prev_v:
            bm_m.edges.new((prev_v, v))
        prev_v = v
    me_m = bpy.data.meshes.new("FrownMouth")
    bm_m.to_mesh(me_m)
    bm_m.free()
    m_ob = bpy.data.objects.new("FrownMouth", me_m)
    bpy.context.scene.collection.objects.link(m_ob)
    m_ob.modifiers.new("Skin", "SKIN")
    for d in m_ob.data.skin_vertices[0].data:
        d.radius = (0.018, 0.018)
    m_ob.data.materials.append(m_dark)
    set_smooth(m_ob)
    m_ob.parent = root

    # Wooden 6-panel propeller baseball cap sitting snug on crown
    cap_dome = new_sphere("WoodenCapDome", 0.275, m_wood_l, root, (0, 0, 1.24), scale=(0.98, 1.04, 0.85))
    new_sphere("WoodenCapCenterPanel", 0.28, m_wood_d, cap_dome, (0, 0, 0.01), scale=(0.56, 1.03, 0.99))
    for si in range(6):
        sa = si * math.pi / 3.0
        new_torus(f"CapSeam_{si}", 0.272, 0.009, m_wood_d, cap_dome, (0, 0, 0.0), rot=(math.pi / 2, 0, sa), maj=24, min_s=6)
    new_sphere("CapVisor", 0.23, m_wood_d, root, (0, -0.23, 1.22), rot=(math.radians(8), 0, 0), scale=(1.08, 1.18, 0.16))
    new_cyl("PropShaft", 0.042, 0.042, 0.14, m_wood_d, root, (0, 0, 1.48), bevel=0.01)

    # Separate spinning node named 'Propeller'!
    prop = new_empty("Propeller", root, (0, 0, 1.56))
    new_sphere("PropHub", 0.074, m_wood_d, prop, (0, 0, 0), scale=(1, 1, 1.15))
    for dir_x in (-1.0, 1.0):
        new_box(f"PropBlade_{dir_x}", (0.48, 0.125, 0.032), m_wood_l, prop, (dir_x * 0.26, 0, 0.01), rot=(math.radians(12 * dir_x), 0, 0), bevel=0.015, subsurf=1)

    out = OUT_AI / "propeller_balloon.glb"
    export_glb(out)
    print(f"BUILT propeller_balloon.glb: tris={count_tris()}, bytes={out.stat().st_size}")


# =====================================================================
# 4. PATCHWORK CUSHION (Art-Bible 02 Bottom-Mid, width 1.0m, 4-panel quilted)
# =====================================================================
def make_patchwork_4color_img(size=512):
    img = bpy.data.images.new("Patchwork4Col", width=size, height=size)
    # Quadrants (u<0.5 pink, u>=0.5 sky blue on top; u<0.5 cream, u>=0.5 coral red on bottom)
    cols = [
        (0.96, 0.52, 0.68),  # bright pastel pink
        (0.32, 0.72, 0.92),  # clear sky blue
        (0.98, 0.86, 0.46),  # warm sunny cream-yellow
        (0.90, 0.32, 0.40),  # coral red
    ]
    px = [0.0] * (size * size * 4)
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            qi = (0 if v >= 0.5 else 2) + (0 if u < 0.5 else 1)
            r, g, b = cols[qi]
            # Woven canvas dot micro-texture
            weave = 0.96 + 0.04 * math.sin(u * 220) * math.sin(v * 220)
            # Crisp delicate cream dashed stitches along seams
            du = min(abs(u - 0.5), abs(u - 0.02), abs(u - 0.98))
            dv = min(abs(v - 0.5), abs(v - 0.02), abs(v - 0.98))
            is_dash = (du < 0.0028 and int(v * 54) % 2 == 0) or (dv < 0.0028 and int(u * 54) % 2 == 0)
            if is_dash:
                r, g, b = 0.98, 0.95, 0.84
            else:
                r, g, b = r * weave, g * weave, b * weave
            idx = (y * size + x) * 4
            px[idx], px[idx + 1], px[idx + 2], px[idx + 3] = r, g, b, 1.0
    img.pixels.foreach_set(px)
    img.pack()
    return img


def build_cushion():
    clear_scene()
    nor_fleece = load_packed_image(PBR_DIR / "polar_fleece" / "nor_gl.jpg", non_color=True)
    img_patch = make_patchwork_4color_img(512)
    m_patch = make_mat("PatchworkCloth", roughness=0.88, color_img=img_patch, normal_img=nor_fleece, normal_strength=0.45)

    # Create nicely subdivided pillow grid with puffy dome & pinched stitched seams!
    bm = bmesh.new()
    nx, ny = 24, 24
    top_grid = []
    bot_grid = []
    for iy in range(ny + 1):
        v = iy / ny
        row_t, row_b = [], []
        for ix in range(nx + 1):
            u = ix / nx
            px = (u - 0.5) * 1.0
            py = (v - 0.5) * 1.0
            # Edge pinch + center puff + subtle cross seam indentation
            rx = abs(u - 0.5) * 2.0
            ry = abs(v - 0.5) * 2.0
            edge = max(0.0, 1.0 - max(rx * rx, ry * ry))
            puff = 0.22 * (edge ** 0.55)
            # Slight pinched corners flare outward gently
            flare = 1.0 + 0.06 * (rx * ry)
            seam = 0.018 if (abs(u - 0.5) < 0.04 or abs(v - 0.5) < 0.04) else 0.0
            hz = max(0.015, puff - seam)
            row_t.append(bm.verts.new((px * flare, py * flare, 0.22 + hz)))
            row_b.append(bm.verts.new((px * flare, py * flare, 0.22 - hz)))
        top_grid.append(row_t)
        bot_grid.append(row_b)

    for iy in range(ny):
        for ix in range(nx):
            bm.faces.new((top_grid[iy][ix], top_grid[iy][ix + 1], top_grid[iy + 1][ix + 1], top_grid[iy + 1][ix]))
            bm.faces.new((bot_grid[iy][ix], bot_grid[iy + 1][ix], bot_grid[iy + 1][ix + 1], bot_grid[iy][ix + 1]))

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("PillowBody")
    bm.to_mesh(me)
    bm.free()

    # Planar UV from XY so 4-color quadrants map cleanly!
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (max(0.0, min(1.0, co.x + 0.5)), max(0.0, min(1.0, co.y + 0.5)))

    ob = bpy.data.objects.new("PatchworkCushion", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(m_patch)
    set_smooth(ob)
    add_subsurf(ob, 1)

    # Shift min Z cleanly to 0
    bpy.context.view_layer.update()
    min_z = min(v.co.z for v in ob.data.vertices)
    ob.location.z = -min_z

    out = OUT_AI / "cushion.glb"
    export_glb(out)
    print(f"BUILT cushion.glb: tris={count_tris()}, bytes={out.stat().st_size}")


# =====================================================================
# 5. GIFT BOX WITH SATIN BOW (Art-Bible 02 Bottom-Right, ~1.0m)
# =====================================================================
def build_gift_box():
    clear_scene()
    m_mint = make_mat("GiftMintBox", (0.34, 0.86, 0.78), roughness=0.28, coat=0.45)
    m_pink = make_mat("GiftPinkLid", (0.98, 0.48, 0.72), roughness=0.28, coat=0.45)
    m_ribbon = make_mat("GiftSilkRibbon", (0.60, 0.50, 0.96), metallic=0.20, roughness=0.16, coat=0.9)

    root = new_empty("GiftRoot", None, (0, 0, 0))
    # Box bottom (min Z = 0)
    new_box("BoxBase", (0.86, 0.86, 0.56), m_mint, root, (0, 0, 0.28), bevel=0.07)
    # Overhanging lid
    new_box("BoxLid", (0.92, 0.92, 0.22), m_pink, root, (0, 0, 0.61), bevel=0.065)

    # Cross satin ribbon bands wrapping box & lid
    new_box("RibbonX", (0.94, 0.14, 0.74), m_ribbon, root, (0, 0, 0.37), bevel=0.02)
    new_box("RibbonY", (0.14, 0.94, 0.74), m_ribbon, root, (0, 0, 0.37), bevel=0.02)

    # Sculpted satin bow on top (z = 0.72..)
    new_sphere("BowKnot", 0.085, m_ribbon, root, (0, 0, 0.78), scale=(1.1, 0.85, 0.9))
    for sx in (-1.0, 1.0):
        # Plush curved bow loop made from squashed rotated torus
        new_torus(
            f"BowLoop_{sx}",
            0.14,
            0.048,
            m_ribbon,
            root,
            (sx * 0.15, 0, 0.86),
            rot=(math.radians(78), math.radians(-28 * sx), 0),
            maj=28,
            min_s=12,
        )
        new_box(
            f"BowTail_{sx}",
            (0.22, 0.11, 0.028),
            m_ribbon,
            root,
            (sx * 0.17, sx * 0.05, 0.735),
            rot=(0, 0, math.radians(16 * sx)),
            bevel=0.008,
        )

    out = OUT_AI / "gift_box.glb"
    export_glb(out)
    print(f"BUILT gift_box.glb: tris={count_tris()}, bytes={out.stat().st_size}")


# =====================================================================
# 6. SMOOTH TOYBOX FOLIAGE & ROUND WOOD FENCE (public/models/toybox_smooth/)
# =====================================================================
def build_smooth_props():
    nor_pine = load_packed_image(PBR_DIR / "coated_pine" / "nor_gl.jpg", non_color=True)

    # Flowers in 3 toybox hues (yellow/orange, pink/rose, skyblue/periwinkle)
    flower_specs = [
        ("flower_daisy_yellow", (1.0, 0.82, 0.14), (0.94, 0.36, 0.10)),
        ("flower_daisy_pink", (0.98, 0.38, 0.64), (1.0, 0.84, 0.18)),
        ("flower_daisy_blue", (0.28, 0.66, 0.98), (1.0, 0.84, 0.18)),
    ]
    for fname, petal_col, center_col in flower_specs:
        clear_scene()
        m_stem = make_mat("StemGreen", (0.24, 0.68, 0.26), roughness=0.52)
        m_petal = make_mat("Petal", petal_col, roughness=0.32, coat=0.35)
        m_center = make_mat("Center", center_col, roughness=0.32, coat=0.3)
        root = new_empty("FlowerRoot")
        new_cyl("Stem", 0.032, 0.025, 0.28, m_stem, root, (0, 0, 0.14), segs=12, bevel=0.005)
        for lx in (-1, 1):
            new_sphere(f"Leaf_{lx}", 0.075, m_stem, root, (lx * 0.09, 0, 0.06), rot=(0, math.radians(28 * lx), 0), scale=(1.5, 0.75, 0.35), segs=12, rings=8)
        head = new_empty("FlowerHead", root, (0, -0.02, 0.28))
        head.rotation_euler = (math.radians(-30), 0, 0)
        new_sphere("ButtonCenter", 0.075, m_center, head, (0, 0, 0.02), scale=(1, 1, 0.6), segs=14, rings=10)
        for p in range(6):
            a = p * math.pi / 3
            new_sphere(f"Petal_{p}", 0.068, m_petal, head, (math.cos(a) * 0.115, math.sin(a) * 0.115, 0), rot=(0, 0, a), scale=(1.25, 0.85, 0.42), segs=12, rings=8)
        out = OUT_SMOOTH / f"{fname}.glb"
        export_glb(out)
        print(f"BUILT {fname}.glb: tris={count_tris()}")

    # Spotted Mushroom Trio
    clear_scene()
    m_cap = make_mat("MushRed", (0.88, 0.10, 0.16), roughness=0.24, coat=0.45)
    m_dot = make_mat("MushDot", (0.98, 0.96, 0.92), roughness=0.35)
    m_stalk = make_mat("MushStalk", (0.95, 0.90, 0.78), roughness=0.6)
    root = new_empty("MushRoot")
    for idx, (ox, oy, sc) in enumerate(((0.0, 0.0, 1.0), (-0.18, 0.12, 0.65), (0.17, -0.10, 0.52))):
        sh = new_empty(f"Mush_{idx}", root, (ox, oy, 0))
        sh.scale = (sc, sc, sc)
        new_cyl(f"Stalk_{idx}", 0.065, 0.048, 0.20, m_stalk, sh, (0, 0, 0.10), segs=14, bevel=0.01)
        cap = new_sphere(f"Cap_{idx}", 0.165, m_cap, sh, (0, 0, 0.21), scale=(1.1, 1.1, 0.65), segs=18, rings=12)
        for d_ang in (0.4, 2.0, 3.6, 5.1):
            new_sphere(f"Spot_{idx}_{d_ang}", 0.036, m_dot, sh, (math.cos(d_ang) * 0.11, math.sin(d_ang) * 0.11, 0.255), scale=(1, 1, 0.55), segs=10, rings=6)
        void = cap
    out = OUT_SMOOTH / "mushroom_spotted.glb"
    export_glb(out)
    print(f"BUILT mushroom_spotted.glb: tris={count_tris()}")

    # Soft Felt Grass Tuft
    clear_scene()
    m_grass = make_mat("SoftGrass", (0.40, 0.80, 0.34), roughness=0.72)
    root = new_empty("GrassRoot")
    for i, (ang, lean, h, w) in enumerate(((0.1, 0.38, 0.26, 0.055), (2.2, 0.44, 0.22, 0.05), (4.3, 0.34, 0.28, 0.055))):
        blade = new_sphere(f"Blade_{i}", 0.09, m_grass, root, (math.cos(ang) * 0.04, math.sin(ang) * 0.04, h * 0.45), rot=(lean, 0, ang), scale=(0.45, 0.9, h / 0.09), segs=10, rings=8)
        void = blade
    out = OUT_SMOOTH / "grass_tuft.glb"
    export_glb(out)
    print(f"BUILT grass_tuft.glb: tris={count_tris()}")

    # Warm Rounded Toy Fence (width 2.4m along X, height 0.82m)
    clear_scene()
    nor_p = load_packed_image(PBR_DIR / "coated_pine" / "nor_gl.jpg", non_color=True)
    img_w = make_wood_img("FenceWood", (0.88, 0.71, 0.46), (0.74, 0.56, 0.34))
    m_fw = make_mat("ToyFenceWood", roughness=0.52, color_img=img_w, normal_img=nor_p, normal_strength=0.35)
    root = new_empty("FenceRoot")
    for px in (-1.15, 0.0, 1.15):
        new_cyl(f"Post_{px}", 0.11, 0.10, 0.80, m_fw, root, (px, 0, 0.40), segs=16, bevel=0.025)
        new_sphere(f"PostCap_{px}", 0.115, m_fw, root, (px, 0, 0.80), scale=(1, 1, 0.55), segs=16, rings=10)
    for rz in (0.30, 0.60):
        new_box(f"Rail_{rz}", (2.42, 0.09, 0.13), m_fw, root, (0, 0, rz), bevel=0.03)
    out = OUT_SMOOTH / "fence_wood_round.glb"
    export_glb(out)
    print(f"BUILT fence_wood_round.glb: tris={count_tris()}")


# =====================================================================
# 7. SIDE-BY-SIDE VISUAL QA PANELS WITH MANMARUBUU (78k tris hero!)
# =====================================================================
def import_asset(path: Path, loc=(0, 0, 0), target_height=None, scale=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    added = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in added if o.parent not in added]
    wrapper = new_empty(f"QA_{path.stem}", None, loc)
    for r in roots:
        r.parent = wrapper
    bpy.context.view_layer.update()
    # Measure world bbox
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in added:
        if o.type == "MESH":
            for c in o.bound_box:
                wc = o.matrix_world @ Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], wc[k])
                    mx[k] = max(mx[k], wc[k])
    if mn.x < 1e8:
        h = max(0.01, mx.z - mn.z)
        sc = (target_height / h) if target_height else (scale or 1.0)
        wrapper.scale = (sc, sc, sc)
        bpy.context.view_layer.update()
        mn2_z = 1e9
        for o in added:
            if o.type == "MESH":
                for c in o.bound_box:
                    wc = o.matrix_world @ Vector(c)
                    mn2_z = min(mn2_z, wc.z)
        wrapper.location.z -= (mn2_z - loc[2])
    return wrapper


def setup_qa_render(scene):
    engines = [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    if scene.world is None:
        scene.world = bpy.data.worlds.new("QAWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.78, 0.90, 0.98, 1.0)
        bg.inputs[1].default_value = 1.05

    sun_d = bpy.data.lights.new("Sun", type="SUN")
    sun_d.energy = 2.8
    sun = bpy.data.objects.new("Sun", sun_d)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(42), math.radians(15), math.radians(-28))

    # Soft felt stage disk
    bpy.ops.mesh.primitive_cylinder_add(radius=14, depth=0.3, location=(0, 0, -0.15))
    floor = bpy.context.active_object
    fm = make_mat("StageGreen", (0.42, 0.74, 0.30), roughness=0.90)
    floor.data.materials.append(fm)

    cam_d = bpy.data.cameras.new("QACam")
    cam_d.lens = 42
    cam = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_qa_panel(filename: str, setup_fn, cam_pos, look_target):
    scene = clear_scene()
    cam = setup_qa_render(scene)
    # Place Hero Manmarubuu at (-1.0, 0, 0) for direct size & style comparison!
    import_asset(HERO_GLB, loc=(-1.1, 0, 0), target_height=1.0)
    setup_fn()
    cam.location = Vector(cam_pos)
    cam.rotation_euler = (Vector(look_target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(TMP_QA / filename)
    bpy.ops.render.render(write_still=True)


def render_all_qa_panels():
    # Sheet 1: AI/High-Detail Boss, Enemies & Hero Props vs Manmarubuu
    render_qa_panel(
        "p1_boss_front.png",
        lambda: import_asset(OUT_AI / "boss_king.glb", loc=(1.3, 0, 0), target_height=6.0),
        (1.6, -10.5, 3.8),
        (0.5, 0, 2.7),
    )
    render_qa_panel(
        "p2_boss_back.png",
        lambda: import_asset(OUT_AI / "boss_king.glb", loc=(0.8, 0, 0), target_height=6.0),
        (-2.8, 9.2, 4.0),
        (0.5, 0, 2.7),
    )
    render_qa_panel(
        "p3_windup_tank.png",
        lambda: import_asset(OUT_AI / "windup_tank.glb", loc=(0.8, 0, 0), target_height=1.35),
        (0.9, -4.0, 1.5),
        (0.0, 0, 0.65),
    )
    render_qa_panel(
        "p4_propeller_balloon.png",
        lambda: import_asset(OUT_AI / "propeller_balloon.glb", loc=(0.8, 0, 0.35), target_height=1.65),
        (0.8, -4.4, 1.6),
        (0.0, 0, 0.95),
    )
    render_qa_panel(
        "p5_cushion.png",
        lambda: import_asset(OUT_AI / "cushion.glb", loc=(0.8, 0, 0), scale=1.5),
        (0.7, -3.8, 1.6),
        (0.0, 0, 0.45),
    )
    render_qa_panel(
        "p6_gift_box.png",
        lambda: import_asset(OUT_AI / "gift_box.glb", loc=(0.8, 0, 0), target_height=1.0),
        (0.9, -3.8, 1.5),
        (0.0, 0, 0.52),
    )

    # Sheet 2: Blender Smooth Foliage & Rounded Fence + KayKit Selected Packs vs Manmarubuu
    def setup_smooth_panel():
        import_asset(OUT_SMOOTH / "flower_daisy_yellow.glb", loc=(0.2, -0.3, 0), scale=1.5)
        import_asset(OUT_SMOOTH / "flower_daisy_pink.glb", loc=(0.75, -0.2, 0), scale=1.5)
        import_asset(OUT_SMOOTH / "flower_daisy_blue.glb", loc=(1.25, -0.35, 0), scale=1.5)
        import_asset(OUT_SMOOTH / "mushroom_spotted.glb", loc=(1.8, 0.1, 0), scale=1.6)
        import_asset(OUT_SMOOTH / "grass_tuft.glb", loc=(-0.3, 0.3, 0), scale=1.5)
        import_asset(OUT_SMOOTH / "fence_wood_round.glb", loc=(0.8, 1.3, 0), scale=1.0)

    render_qa_panel("s1_smooth_props.png", setup_smooth_panel, (0.4, -4.5, 1.7), (0.3, 0.3, 0.55))

    def setup_medieval_panel():
        import_asset(KAYKIT_DIR / "medieval/buildings/red/building_home_A_red.gltf", loc=(1.2, 1.2, 0), scale=3.2)
        import_asset(KAYKIT_DIR / "medieval/buildings/green/building_market_green.gltf", loc=(4.4, 1.0, 0), scale=2.2)
        import_asset(KAYKIT_DIR / "medieval/decoration/nature/tree_single_A.gltf", loc=(-2.8, 1.6, 0), scale=2.6)
        import_asset(KAYKIT_DIR / "medieval/decoration/nature/trees_A_small.gltf", loc=(6.5, 2.5, 0), scale=2.0)

    render_qa_panel("s2_kaykit_medieval.png", setup_medieval_panel, (1.0, -9.2, 3.6), (1.2, 0.8, 1.2))

    def setup_dungeon_panel():
        import_asset(KAYKIT_DIR / "dungeon/chest_gold.glb", loc=(0.6, 0, 0), scale=0.85)
        import_asset(KAYKIT_DIR / "dungeon/barrel_large_decorated.gltf.glb", loc=(2.4, 0.4, 0), scale=0.75)
        import_asset(KAYKIT_DIR / "dungeon/crates_stacked.gltf.glb", loc=(4.1, 0.8, 0), scale=0.8)
        import_asset(KAYKIT_DIR / "dungeon/banner_triple_red.gltf.glb", loc=(2.4, 2.2, 0), scale=0.85)

    render_qa_panel("s3_kaykit_dungeon.png", setup_dungeon_panel, (1.2, -6.5, 2.5), (1.3, 0.5, 1.0))

    def setup_city_furn_panel():
        import_asset(KAYKIT_DIR / "city/bench.gltf", loc=(0.5, 0.2, 0), scale=3.6)
        import_asset(KAYKIT_DIR / "city/streetlight.gltf", loc=(2.0, 0.6, 0), scale=2.8)
        import_asset(KAYKIT_DIR / "city/bush.gltf", loc=(-2.2, 0.4, 0), scale=2.4)
        import_asset(KAYKIT_DIR / "city/car_hatchback.gltf", loc=(3.8, 0.4, 0), scale=2.4)
        import_asset(KAYKIT_DIR / "furniture/book_set.gltf", loc=(-0.1, -0.5, 0), scale=1.1)

    render_qa_panel("s4_kaykit_city_furn.png", setup_city_furn_panel, (0.8, -6.2, 2.2), (0.8, 0.2, 0.85))
    print("===QA_PANELS_RENDERED===")


if __name__ == "__main__":
    build_boss_king()
    build_windup_tank()
    build_propeller_balloon()
    build_cushion()
    build_gift_box()
    build_smooth_props()
    render_all_qa_panels()
