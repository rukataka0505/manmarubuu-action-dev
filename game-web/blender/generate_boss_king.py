"""Build CLOCKWORK TOY KING (1:6 scale vs 1.0m Manmarubuu) matching 03_boss_clockwork_toy_king.jpg."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

GAME_ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web")
OUT_BLEND = GAME_ROOT / "blender" / "clockwork_toy_king.blend"
OUT_GLB = GAME_ROOT / "public" / "models" / "clockwork_toy_king.glb"
OUT_PREVIEW = GAME_ROOT / "blender" / "boss_preview.png"


def make_wood_texture(name, base_rgb, dark_rgb, size=256):
    img = bpy.data.images.new(name, width=size, height=size)
    pixels = [0.0] * (size * size * 4)
    for y in range(size):
        for x in range(size):
            u = x / size
            v = y / size
            grain = (
                0.5
                + 0.28 * math.sin(u * 42.0 + math.sin(v * 8.0) * 1.4)
                + 0.14 * math.sin(u * 95.0 + v * 6.0)
                + 0.08 * math.cos(v * 20.0 + u * 17.0)
            )
            grain = max(0.0, min(1.0, grain))
            r = base_rgb[0] * (1 - grain * 0.28) + dark_rgb[0] * (grain * 0.28)
            g = base_rgb[1] * (1 - grain * 0.28) + dark_rgb[1] * (grain * 0.28)
            b = base_rgb[2] * (1 - grain * 0.28) + dark_rgb[2] * (grain * 0.28)
            idx = (y * size + x) * 4
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = 1.0
    img.pixels.foreach_set(pixels)
    img.pack()
    return img


def make_pbr_mat(name, color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0, wood_img=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if wood_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = wood_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if emission is not None and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_empty(name, parent=None, loc=(0, 0, 0)):
    em = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(em)
    em.empty_display_size = 0.25
    if parent is not None:
        em.parent = parent
    em.location = loc
    return em


def add_box(name, size, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.03):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def add_cyl(name, radius1, radius2, depth, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, bevel=0.02):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
    )
    if bevel > 0:
        # Bevel rim edges
        rim_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.001]
        if rim_edges:
            bmesh.ops.bevel(bm, geom=rim_edges, offset=bevel, segments=2, affect="EDGES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def add_gear(name, radius, thickness, teeth, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    segs = teeth * 4
    inner_r = radius * 0.42
    mid_r = radius * 0.80
    outer_r = radius
    top_z = thickness * 0.5
    bot_z = -thickness * 0.5

    top_outer = []
    bot_outer = []
    top_inner = []
    bot_inner = []
    for i in range(segs):
        ang = (2 * math.pi * i) / segs
        phase = i % 4
        r = outer_r if phase in (1, 2) else mid_r
        cx, cy = math.cos(ang), math.sin(ang)
        top_outer.append(bm.verts.new((cx * r, cy * r, top_z)))
        bot_outer.append(bm.verts.new((cx * r, cy * r, bot_z)))
        top_inner.append(bm.verts.new((cx * inner_r, cy * inner_r, top_z)))
        bot_inner.append(bm.verts.new((cx * inner_r, cy * inner_r, bot_z)))

    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((top_outer[i], top_outer[j], top_inner[j], top_inner[i]))
        bm.faces.new((bot_inner[i], bot_inner[j], bot_outer[j], bot_outer[i]))
        bm.faces.new((bot_outer[i], bot_outer[j], top_outer[j], top_outer[i]))
        bm.faces.new((top_inner[i], top_inner[j], bot_inner[j], bot_inner[i]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def add_torus_mesh(name, major_r, minor_r, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), segs_maj=28, segs_min=12):
    bm = bmesh.new()
    rings = []
    for i in range(segs_maj):
        u = (2 * math.pi * i) / segs_maj
        cu, su = math.cos(u), math.sin(u)
        ring = []
        for j in range(segs_min):
            v = (2 * math.pi * j) / segs_min
            cv, sv = math.cos(v), math.sin(v)
            rr = major_r + minor_r * cv
            ring.append(bm.verts.new((rr * cu, rr * su, minor_r * sv)))
        rings.append(ring)
    for i in range(segs_maj):
        ni = (i + 1) % segs_maj
        for j in range(segs_min):
            nj = (j + 1) % segs_min
            bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def add_sphere(name, radius, mat, parent=None, loc=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=radius)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    return ob


def build_boss():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"

    # Materials matching 03_boss_clockwork_toy_king.jpg
    wood_blue_img = make_wood_texture("BossWoodBlue", (0.14, 0.24, 0.48), (0.08, 0.14, 0.31))
    wood_cream_img = make_wood_texture("BossWoodCream", (0.86, 0.75, 0.52), (0.72, 0.60, 0.38))
    wood_walnut_img = make_wood_texture("BossWoodWalnut", (0.36, 0.21, 0.13), (0.22, 0.12, 0.07))
    wood_pale_img = make_wood_texture("BossWoodPale", (0.76, 0.64, 0.49), (0.62, 0.50, 0.36))

    mat_blue = make_pbr_mat("BossRoyalBlue", (0.14, 0.24, 0.48), metallic=0.05, roughness=0.45, wood_img=wood_blue_img)
    mat_cream = make_pbr_mat("BossCreamTrim", (0.86, 0.75, 0.52), metallic=0.05, roughness=0.42, wood_img=wood_cream_img)
    mat_walnut = make_pbr_mat("BossWalnut", (0.36, 0.21, 0.13), metallic=0.04, roughness=0.48, wood_img=wood_walnut_img)
    mat_pale_wood = make_pbr_mat("BossPaleWood", (0.76, 0.64, 0.49), metallic=0.02, roughness=0.52, wood_img=wood_pale_img)
    mat_brass = make_pbr_mat("BossBrass", (0.94, 0.72, 0.24), metallic=0.88, roughness=0.22)
    mat_gold_key = make_pbr_mat("BossGoldKey", (1.0, 0.80, 0.20), metallic=0.92, roughness=0.18, emission=(1.0, 0.78, 0.15), emission_strength=0.35)
    mat_tin = make_pbr_mat("BossTinSteel", (0.52, 0.54, 0.56), metallic=0.72, roughness=0.34)
    mat_dark_steel = make_pbr_mat("BossDarkSteel", (0.14, 0.16, 0.20), metallic=0.5, roughness=0.5)
    mat_eye = make_pbr_mat("BossGlowingEye", (1.0, 0.85, 0.20), metallic=0.0, roughness=0.15, emission=(1.0, 0.82, 0.18), emission_strength=4.5)

    root = add_empty("BossRoot", None, (0, 0, 0))
    pelvis = add_empty("Pelvis", root, (0, 0, 1.95))

    # Pelvis core & brass gear belt
    add_cyl("PelvisCore", 0.92, 0.96, 0.52, mat_blue, pelvis, (0, 0, 0), bevel=0.03)
    add_cyl("BeltTrim", 1.02, 1.02, 0.18, mat_cream, pelvis, (0, 0, 0.22), bevel=0.02)
    add_gear("BellyGear", 0.52, 0.18, 12, mat_brass, pelvis, (0, -0.78, 0.32), rot=(math.pi / 2, 0, 0))
    add_gear("WaistGearRing", 0.98, 0.14, 24, mat_brass, pelvis, (0, 0, 0.35))

    # Detachable skirt armor plates (Front, Back, Left, Right) with cream trim
    sk_f = add_box("Armor_Skirt_F", (0.98, 0.18, 0.84), mat_blue, pelvis, (0, -0.94, -0.26), rot=(math.radians(-14), 0, 0), bevel=0.04)
    add_box("Armor_Skirt_F_Trim", (1.08, 0.22, 0.14), mat_cream, sk_f, (0, 0, -0.36), bevel=0.02)
    sk_b = add_box("Armor_Skirt_B", (0.98, 0.18, 0.84), mat_blue, pelvis, (0, 0.94, -0.26), rot=(math.radians(14), 0, 0), bevel=0.04)
    add_box("Armor_Skirt_B_Trim", (1.08, 0.22, 0.14), mat_cream, sk_b, (0, 0, -0.36), bevel=0.02)
    sk_l = add_box("Armor_Skirt_L", (0.20, 1.16, 0.80), mat_blue, pelvis, (1.00, 0, -0.24), rot=(0, math.radians(-14), 0), bevel=0.04)
    add_box("Armor_Skirt_L_Trim", (0.24, 1.24, 0.14), mat_cream, sk_l, (0, 0, -0.34), bevel=0.02)
    sk_r = add_box("Armor_Skirt_R", (0.20, 1.16, 0.80), mat_blue, pelvis, (-1.00, 0, -0.24), rot=(0, math.radians(14), 0), bevel=0.04)
    add_box("Armor_Skirt_R_Trim", (0.24, 1.24, 0.14), mat_cream, sk_r, (0, 0, -0.34), bevel=0.02)

    # Legs (Left=+X, Right=-X)
    for side, sx in (("L", 1.0), ("R", -1.0)):
        leg = add_empty(f"Leg_{side}", pelvis, (sx * 0.72, 0, -0.15))
        add_cyl(f"Thigh_{side}", 0.34, 0.28, 0.78, mat_pale_wood, leg, (0, 0, -0.42), bevel=0.02)
        add_gear(f"KneeGear_{side}", 0.34, 0.22, 10, mat_brass, leg, (0, 0, -0.84), rot=(0, math.pi / 2, 0))
        add_box(f"KneePad_{side}", (0.34, 0.16, 0.34), mat_cream, leg, (0, -0.34, -0.84), rot=(0, math.radians(45), 0), bevel=0.03)
        add_box(f"Shin_{side}", (0.64, 0.70, 0.64), mat_blue, leg, (0, 0, -1.24), bevel=0.05)
        add_box(f"Boot_{side}", (0.76, 1.08, 0.44), mat_blue, leg, (0, -0.18, -1.58), bevel=0.05)
        add_box(f"BootTrim_{side}", (0.82, 1.14, 0.12), mat_cream, leg, (0, -0.18, -1.36), bevel=0.02)

    # Torso (total chest width ~2.3m, height ~1.9m)
    torso = add_empty("Torso", pelvis, (0, 0, 0.48))
    add_box("ChestMain", (2.15, 1.62, 1.68), mat_blue, torso, (0, 0, 0.88), bevel=0.08)
    add_box("ChestFrontShield", (0.78, 0.44, 1.38), mat_cream, torso, (0, -0.78, 0.90), bevel=0.05)
    add_box("ChestTopTrim", (2.28, 1.72, 0.16), mat_cream, torso, (0, 0, 1.68), bevel=0.03)
    add_cyl("CollarRing", 0.82, 0.86, 0.22, mat_cream, torso, (0, 0, 1.78), bevel=0.03)
    add_gear("RibGear_L", 0.56, 0.16, 12, mat_brass, torso, (1.02, 0.0, 0.72), rot=(0, math.pi / 2, 0))
    add_gear("RibGear_R", 0.56, 0.16, 12, mat_brass, torso, (-1.02, 0.0, 0.72), rot=(0, math.pi / 2, 0))

    # Back Wind-up Key (WEAK POINT on +Y back side)
    key_pivot = add_empty("BackWindupKey", torso, (0, 0.84, 0.98))
    add_cyl("KeyBasePlate", 0.64, 0.68, 0.20, mat_gold_key, key_pivot, (0, 0.05, 0), rot=(math.pi / 2, 0, 0), bevel=0.03)
    add_cyl("KeyShaft", 0.20, 0.20, 0.72, mat_gold_key, key_pivot, (0, 0.40, 0), rot=(math.pi / 2, 0, 0), bevel=0.02)
    add_torus_mesh("KeyBowUpper", 0.54, 0.12, mat_gold_key, key_pivot, (0, 0.76, 0.44), rot=(math.pi / 2, 0, 0))
    add_torus_mesh("KeyBowLower", 0.54, 0.12, mat_gold_key, key_pivot, (0, 0.76, -0.44), rot=(math.pi / 2, 0, 0))
    add_torus_mesh("KeyBowTip", 0.34, 0.10, mat_gold_key, key_pivot, (0, 0.76, 0.0), rot=(math.pi / 2, 0, 0))
    add_box("KeyCenterBar", (0.20, 0.22, 1.05), mat_gold_key, key_pivot, (0, 0.76, 0), bevel=0.03)

    # Head & Crown
    head = add_empty("Head", torso, (0, 0, 1.84))
    add_cyl("HeadCore", 0.66, 0.62, 0.90, mat_tin, head, (0, 0, 0.44), bevel=0.03)
    add_box("FaceDarkSlot", (0.94, 0.44, 0.28), mat_dark_steel, head, (0, -0.48, 0.46), bevel=0.02)
    add_sphere("Eye_L", 0.12, mat_eye, head, (0.24, -0.66, 0.46), scale=(1.2, 0.6, 0.95))
    add_sphere("Eye_R", 0.12, mat_eye, head, (-0.24, -0.66, 0.46), scale=(1.2, 0.6, 0.95))

    # Helmet dome + visor grille
    add_sphere("HelmetDome", 0.72, mat_blue, head, (0, 0, 0.72), scale=(1.0, 1.0, 0.72))
    add_cyl("VisorBand", 0.74, 0.74, 0.22, mat_blue, head, (0, 0, 0.70), bevel=0.02)
    for vx in (-0.38, -0.20, 0.0, 0.20, 0.38):
        add_box(f"VisorBar_{vx:.2f}", (0.065, 0.14, 0.22), mat_blue, head, (vx, -0.68, 0.64), bevel=0.01)

    # Crown & Royal Feather Plume (total top reaches ~6.0m!)
    add_cyl("CrownBand", 0.56, 0.68, 0.32, mat_brass, head, (0, 0, 1.12), bevel=0.02)
    for k in range(6):
        ang = (2 * math.pi * k) / 6
        px, py = math.cos(ang) * 0.62, math.sin(ang) * 0.62
        add_cyl(f"CrownSpike_{k}", 0.08, 0.02, 0.24, mat_brass, head, (px, py, 1.34), bevel=0.01)
        add_sphere(f"CrownOrb_{k}", 0.075, mat_brass, head, (px, py, 1.46))
    add_sphere("PlumeBase", 0.22, mat_blue, head, (0, 0.04, 1.38), scale=(0.8, 1.2, 1.5))
    add_sphere("PlumeCrest", 0.24, mat_blue, head, (0, 0.24, 1.66), scale=(0.7, 1.3, 1.3))

    # Shoulders, Detachable Shoulder Pauldrons, Arms, Giant Wooden Gauntlets
    for side, sx in (("L", 1.0), ("R", -1.0)):
        sh = add_empty(f"Shoulder_{side}", torso, (sx * 1.52, 0, 1.24))
        add_gear(f"ShoulderGear_{side}", 0.44, 0.22, 10, mat_brass, sh, (-sx * 0.18, 0, 0), rot=(0, math.pi / 2, 0))

        # Detachable shoulder pauldron
        pauldron = add_box(f"Armor_Shoulder_{side}", (1.12, 1.42, 1.08), mat_blue, sh, (sx * 0.18, 0, 0.06), bevel=0.08)
        add_box(f"Armor_Shoulder_Trim_{side}", (1.18, 1.48, 0.16), mat_cream, pauldron, (0, 0, -0.46), bevel=0.03)
        add_box(f"Armor_Shoulder_Band_{side}", (0.18, 1.46, 1.12), mat_cream, pauldron, (-sx * 0.48, 0, 0.02), bevel=0.02)

        arm = add_empty(f"Arm_{side}", sh, (sx * 0.28, 0, -0.58))
        add_cyl(f"UpperArm_{side}", 0.34, 0.30, 0.84, mat_pale_wood, arm, (0, 0, -0.42), bevel=0.02)
        add_gear(f"ElbowGear_{side}", 0.36, 0.24, 10, mat_brass, arm, (0, 0, -0.84), rot=(0, math.pi / 2, 0))

        gauntlet = add_empty(f"Gauntlet_{side}", arm, (0, 0, -0.94))
        add_box(f"CuffTrim_{side}", (0.98, 0.98, 0.22), mat_cream, gauntlet, (0, 0, -0.10), bevel=0.03)
        add_box(f"ForearmBlock_{side}", (0.92, 0.92, 1.02), mat_walnut, gauntlet, (0, 0, -0.70), bevel=0.06)
        add_box(f"FistCore_{side}", (0.86, 0.86, 0.68), mat_walnut, gauntlet, (0, -0.04, -1.42), bevel=0.06)
        add_box(f"FistPlate_{side}", (0.30, 0.72, 0.56), mat_blue, gauntlet, (sx * 0.36, -0.04, -1.44), bevel=0.03)
        add_box(f"Thumb_{side}", (0.30, 0.36, 0.42), mat_walnut, gauntlet, (-sx * 0.32, -0.34, -1.36), bevel=0.04)

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), compress=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_tangents=True,
        export_image_format="AUTO",
    )

    # Render front + back preview PNGs
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    if scene.world is None:
        scene.world = bpy.data.worlds.new("BossWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.92, 0.88, 0.80, 1.0)
        bg.inputs[1].default_value = 1.15

    sun = bpy.data.lights.new("BossSun", type="SUN")
    sun.energy = 3.0
    sun_ob = bpy.data.objects.new("BossSun", sun)
    scene.collection.objects.link(sun_ob)
    sun_ob.rotation_euler = (math.radians(48), math.radians(15), math.radians(-30))

    cam_d = bpy.data.cameras.new("BossCam")
    cam_d.lens = 45
    cam = bpy.data.objects.new("BossCam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    tmp = GAME_ROOT / "blender" / "_tmp_boss"
    tmp.mkdir(parents=True, exist_ok=True)
    views = [("FRONT", (4.8, -9.2, 4.2)), ("BACK", (-4.6, 8.8, 4.2))]
    for label, pos in views:
        cam.location = pos
        cam.rotation_euler = (Vector((0, 0, 2.9)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        p = tmp / f"{label}.png"
        scene.render.filepath = str(p)
        bpy.ops.render.render(write_still=True)

    print("===BOSS_EXPORT_OK===")
    print("GLB_BYTES:", OUT_GLB.stat().st_size)


if __name__ == "__main__":
    build_boss()
